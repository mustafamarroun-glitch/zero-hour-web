"""Independent WSL rendering and NVENC smoke test, without CUDA/EGL interop."""
import ctypes as c
import json
import subprocess
import sys


def rendering():
    egl = c.CDLL("libEGL.so.1")
    egl.eglGetPlatformDisplay.argtypes = [c.c_uint, c.c_void_p, c.c_void_p]
    egl.eglGetPlatformDisplay.restype = c.c_void_p
    display = egl.eglGetPlatformDisplay(0x31DD, None, None)
    egl.eglInitialize.argtypes = [c.c_void_p, c.POINTER(c.c_int), c.POINTER(c.c_int)]
    major, minor = c.c_int(), c.c_int()
    if not egl.eglInitialize(display, c.byref(major), c.byref(minor)):
        raise RuntimeError("EGL initialization failed")
    egl.eglBindAPI.argtypes = [c.c_uint]
    if not egl.eglBindAPI(0x30A0):
        raise RuntimeError("OpenGL ES API unavailable")
    attributes = (c.c_int * 13)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3038)
    config, count = c.c_void_p(), c.c_int()
    egl.eglChooseConfig.argtypes = [c.c_void_p, c.POINTER(c.c_int), c.POINTER(c.c_void_p), c.c_int, c.POINTER(c.c_int)]
    if not egl.eglChooseConfig(display, attributes, c.byref(config), 1, c.byref(count)) or not count.value:
        raise RuntimeError("OpenGL ES 3 config unavailable")
    egl.eglCreateContext.argtypes = [c.c_void_p, c.c_void_p, c.c_void_p, c.POINTER(c.c_int)]
    egl.eglCreateContext.restype = c.c_void_p
    context = egl.eglCreateContext(display, config, None, (c.c_int * 3)(0x3098, 3, 0x3038))
    egl.eglCreatePbufferSurface.argtypes = [c.c_void_p, c.c_void_p, c.POINTER(c.c_int)]
    egl.eglCreatePbufferSurface.restype = c.c_void_p
    surface = egl.eglCreatePbufferSurface(display, config, (c.c_int * 5)(0x3057, 64, 0x3056, 64, 0x3038))
    egl.eglMakeCurrent.argtypes = [c.c_void_p, c.c_void_p, c.c_void_p, c.c_void_p]
    if not context or not surface or not egl.eglMakeCurrent(display, surface, surface, context):
        raise RuntimeError("Cannot make hardware graphics context current")
    gl = c.CDLL("libGLESv2.so.2")
    gl.glGetString.argtypes = [c.c_uint]
    gl.glGetString.restype = c.c_char_p
    renderer = gl.glGetString(0x1F01).decode()
    gl.glClearColor.argtypes = [c.c_float] * 4
    gl.glClearColor(1, 0, 0, 1)
    gl.glClear(0x4000)
    pixel = (c.c_ubyte * 4)()
    gl.glReadPixels(0, 0, 1, 1, 0x1908, 0x1401, pixel)
    if list(pixel) != [255, 0, 0, 255]:
        raise RuntimeError("Hardware draw/readback failed")
    return {"renderer": renderer, "pixel": list(pixel), "hardware": "nvidia" in renderer.lower() and not any(v in renderer.lower() for v in ("llvmpipe", "swiftshader", "softpipe"))}


report = {"scope": "Independent EGL draw and synthetic 1080p60 NVENC; not streamed game acceptance", "passed": False}
try:
    report["rendering"] = rendering()
    result = subprocess.run(["ffmpeg", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=60", "-frames:v", "120", "-c:v", "h264_nvenc", "-preset", "p1", "-tune", "ull", "-bf", "0", "-f", "null", "-"], capture_output=True, text=True, timeout=45)
    report["nvenc"] = {"exitCode": result.returncode, "diagnostics": result.stderr}
    report["passed"] = report["rendering"]["hardware"] and result.returncode == 0
except Exception as error:
    report["error"] = str(error)
print(json.dumps(report, indent=2))
sys.exit(0 if report["passed"] else 2)
