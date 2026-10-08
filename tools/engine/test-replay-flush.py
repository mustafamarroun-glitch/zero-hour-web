"""Run the real recorder methods in a small C++ fixture for flush correctness.

This verifies serialization/flush boundaries; native replay playback remains a
separate real-engine acceptance check. Run inside the Emscripten build image.
"""
import pathlib,re,subprocess,sys,json,hashlib
source=pathlib.Path(sys.argv[1]).read_text()
out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
methods=[]
for name in ['updateRecord','writeToFile','writeArgument','stopRecording']:
    match=re.search(r'void RecorderClass::'+name+r'\([^\n]*',source)
    if not match:raise ValueError('Missing method '+name)
    end=source.index('\n}',match.start())+2
    methods.append(source[match.start():end])
fixture=r'''
#include <cstdio>
#include <cstdint>
#include <vector>
#include <string>
#include <cassert>
using Int=int32_t;using UnsignedInt=uint32_t;using UnsignedByte=uint8_t;
using UnsignedShort=uint16_t;using Bool=bool;using ReplayWideChar=uint16_t;
constexpr Bool TRUE=true,FALSE=false;
enum {GAME_SHELL=1,GAME_SINGLE_PLAYER=2,GAME_NONE=0,DIFFICULTY_NORMAL=0};
using GameDifficulty=int;
enum GameMessageArgumentDataType {ARGUMENTDATATYPE_INTEGER,ARGUMENTDATATYPE_REAL,
 ARGUMENTDATATYPE_BOOLEAN,ARGUMENTDATATYPE_OBJECTID,ARGUMENTDATATYPE_DRAWABLEID,
 ARGUMENTDATATYPE_TEAMID,ARGUMENTDATATYPE_LOCATION,ARGUMENTDATATYPE_PIXEL,
 ARGUMENTDATATYPE_PIXELREGION,ARGUMENTDATATYPE_TIMESTAMP,ARGUMENTDATATYPE_WIDECHAR};
struct Coord3D {float x,y,z;};struct Pixel {int32_t x,y;};struct Region {Pixel lo,hi;};
struct GameMessageArgumentType {int32_t integer=0;float real=0;bool boolean=false;
 uint32_t objectID=0,drawableID=0;int32_t teamID=0;Coord3D location{};Pixel pixel{};
 Region pixelRegion{};uint32_t timestamp=0,wChar=0;};
struct GameMessage {
 enum Type {MSG_NEW_GAME=1,MSG_CLEAR_GAME_DATA=2,MSG_BEGIN_NETWORK_MESSAGES=10,
 MSG_END_NETWORK_MESSAGES=100,MSG_FIXTURE=20};
 Type type=MSG_FIXTURE;GameMessage*following=nullptr;
 std::vector<GameMessageArgumentType> args;
 Type getType(){return type;}Int getPlayerIndex(){return 1;}
 Int getArgumentCount(){return args.size();}
 GameMessageArgumentType*getArgument(Int i){return &args.at(i);}
 GameMessageArgumentDataType getArgumentDataType(Int i){return static_cast<GameMessageArgumentDataType>(i);}
 GameMessage*next(){return following;}
};
struct GameMessageParserArgumentType {Int type;GameMessageParserArgumentType*following=nullptr;
 Int getType(){return type;}Int getArgCount(){return 1;}GameMessageParserArgumentType*getNext(){return following;}};
struct GameMessageParser {
 std::vector<GameMessageParserArgumentType> groups;
 explicit GameMessageParser(GameMessage*m){for(Int i=0;i<m->getArgumentCount();i++)groups.push_back({i});
 for(size_t i=1;i<groups.size();i++)groups[i-1].following=&groups[i];}
 Int getNumTypes(){return groups.size();}
 GameMessageParserArgumentType*getFirstArgumentType(){return groups.empty()?nullptr:&groups[0];}
 void deleteInstance(){delete this;}
};
struct Logic {UnsignedInt getFrame(){return 123;}} logic;
Logic*TheGameLogic=&logic;
struct Commands {GameMessage*head=nullptr;GameMessage*getFirstMessage(){return head;}} commands;
Commands*TheCommandList=&commands;
void*TheNetwork=nullptr;
struct FileName {void clear(){}};
struct RecorderClass {FILE*m_file=nullptr;Int m_originalGameMode=0;Bool m_wasDesync=false;FileName m_fileName;
 void updateRecord();void writeToFile(GameMessage*);void writeArgument(GameMessageArgumentDataType,GameMessageArgumentType);void stopRecording();
 void startRecording(GameDifficulty,Int,Int,Int){}void logGameEnd(){}void cleanUpReplayFile(){}
};
#define DEBUG_LOG(x) do {} while(0)
#define newInstance(type) new type
static void noteReplayProfile(const char*){}
static int flushes=0;
static int trackedFlush(FILE*file){assert(file!=nullptr);++flushes;return std::fflush(file);}
#define fflush trackedFlush
'''
main=r'''
#undef fflush
int main(int argc,char**argv){
 assert(argc==2);
 for(int scenario=0;scenario<3;scenario++){
   int count=scenario==2?0:20;
   std::vector<GameMessage> messages(count+(scenario==1?1:0));
   for(int i=0;i<count;i++){
     auto&m=messages[i];m.args.resize(11);
     m.args[0].integer=42+i;m.args[1].real=1.25f;m.args[2].boolean=true;
     m.args[3].objectID=456;m.args[4].drawableID=789;m.args[5].teamID=2;
     m.args[6].location={1,2,3};m.args[7].pixel={4,5};m.args[8].pixelRegion={{6,7},{8,9}};
     m.args[9].timestamp=1000;m.args[10].wChar=0x0627;
   }
   if(scenario==1)messages.back().type=GameMessage::MSG_CLEAR_GAME_DATA;
   for(size_t i=1;i<messages.size();i++)messages[i-1].following=&messages[i];
   commands.head=messages.empty()?nullptr:&messages[0];
   std::string path=std::string(argv[1])+"/scenario-"+std::to_string(scenario)+".bin";
   RecorderClass recorder;recorder.m_file=std::fopen(path.c_str(),"wb");assert(recorder.m_file);
   flushes=0;recorder.updateRecord();
   if(recorder.m_file){std::fclose(recorder.m_file);recorder.m_file=nullptr;}
#ifdef CNC_WEB_REPLAY_FLUSH_BASELINE
   assert(flushes==(scenario==0?21:scenario==1?21:0));
#else
   assert(flushes==(scenario==0?1:0));
#endif
   std::printf("scenario=%d flushCalls=%d\n",scenario,flushes);
 }
}
'''
cpp=out/'recorder-fixture.cpp';cpp.write_text(fixture+'\n'.join(methods)+main)
results={}
for mode in ['baseline','optimized']:
    directory=out/mode;directory.mkdir(exist_ok=True)
    executable=out/('recorder-'+mode)
    flags=['-DCNC_WEB_REPLAY_FLUSH_BASELINE=1'] if mode=='baseline' else []
    subprocess.run(['g++','-std=c++17','-O2','-D__EMSCRIPTEN__',*flags,str(cpp),'-o',str(executable)],check=True)
    result=subprocess.run([str(executable),str(directory)],check=True,capture_output=True,text=True)
    results[mode]={'stdout':result.stdout,'files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in directory.glob('*.bin')}}
if results['baseline']['files']!=results['optimized']['files']:raise AssertionError('Replay command bytes changed')
(out/'results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
