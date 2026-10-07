"""Duplicate-disconnect regression using the real class methods and test doubles.

AST loading avoids initializing LAN credentials, X11 or GPU dependencies.
This verifies resource ownership, not actual input/gameplay or encoder speed.
"""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


class Track:
    def stop(self):
        self.readyState = 'ended'


class Executor:
    def __init__(self):
        self.closed = False
        self.submissions = 0

    def submit(self, callback):
        if self.closed:
            raise RuntimeError('Cannot schedule after executor shutdown')
        self.submissions += 1
        callback()

    def shutdown(self, **kwargs):
        self.closed = True


events = []
source = ast.parse(Path(__file__).with_name('wsl-bridge.py').read_text())
classes = [node for node in source.body if isinstance(node, ast.ClassDef)
           and node.name in {'DesktopVideo', 'DesktopAudio', 'RemoteInput'}]
scope = {'VideoStreamTrack': Track, 'MediaStreamTrack': Track,
         'X': SimpleNamespace(KeyRelease='key-up', ButtonRelease='button-up'),
         'xtest': SimpleNamespace(fake_input=lambda *args: events.append(args[1:])),
         'subprocess': __import__('subprocess')}
exec(compile(ast.Module(body=classes, type_ignores=[]), 'host-class-methods', 'exec'), scope)


class Lifecycle(unittest.TestCase):
    def test_held_controls_release_before_close_exactly_once(self):
        events.clear()
        control = object.__new__(scope['RemoteInput'])
        control.closed = False
        control.keys, control.buttons = {11, 12}, {1, 3}
        control.x = SimpleNamespace(sync=lambda: events.append('sync'), close=lambda: events.append('close'))
        control.close()
        control.close()
        control.release()
        self.assertEqual(len([e for e in events if isinstance(e, tuple)]), 4)
        self.assertEqual(events[-2:], ['sync', 'close'])
        self.assertEqual(events.count('close'), 1)
        self.assertEqual(control.keys | control.buttons, set())

    def test_double_video_stop_never_submits_to_closed_executor(self):
        track = object.__new__(scope['DesktopVideo'])
        track.readyState = 'live'
        track.framebuffer = track.framebuffer_file = None
        track.executor = Executor()
        track.stop()
        track.stop()
        self.assertEqual(track.executor.submissions, 1)
        self.assertTrue(track.executor.closed)

    def test_audio_process_terminates_once_on_duplicate_stop(self):
        calls = []
        track = object.__new__(scope['DesktopAudio'])
        track.readyState = 'live'
        track.executor = Executor()
        track.process = SimpleNamespace(poll=lambda: None,
                                        terminate=lambda: calls.append('terminate'),
                                        wait=lambda **kwargs: calls.append('wait'))
        track.stop()
        track.stop()
        self.assertEqual(calls, ['terminate', 'wait'])
        self.assertTrue(track.executor.closed)


if __name__ == '__main__':
    unittest.main()
