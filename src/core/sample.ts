import type { Case } from './schema.ts';
export const sampleCase: Case = {
  schemaVersion: 1,
  title: '雨停之前', logline: '暴雨封山，一卷即将公映的老胶片失踪了。每个人都想让今晚的放映停下来。',
  opening: '23:20，青苔旅馆的放映员发现胶片铁盒空了。十分钟前，山间旅馆经历过一次短暂停电。你是受邀修复这卷纪录片的档案师，最后一班接驳车要到天亮才能上山。先去大堂看看。',
  style: '写实悬疑电影，1998 年中国南方山间旅馆，墨绿色与钨丝灯琥珀色，35mm 胶片颗粒，克制的固定镜头，无可读文字，无水印。所有角色均为成年人。',
  truth: { culpritId: 'lin', motive: '林知夏想找回胶片中母亲的一段未获同意的私人影像，临时藏起胶片阻止放映。', method: '利用预定的短时停电，在 23:12 取走胶片，藏进茶室通风柜。她用提前录好的钢琴声制造自己一直在茶室弹琴的假象。', requiredEvidenceIds: ['power_log', 'piano_tape', 'witness'], timeline: [ {time:'22:40',event:'林知夏向店主借走便携录音机。'}, {time:'23:10',event:'山庄短暂停电，备用电源随后启动。'}, {time:'23:12',event:'林知夏从放映室带走胶片。'}, {time:'23:15',event:'陈默在走廊遇见抱着铁盒的林知夏。'} ] },
  characters: [
    { id:'lin', name:'林知夏', role:'钢琴教师 · 29 岁', description:'黑色齐肩短发，米白针织衫，墨绿色半裙；右手食指贴着一小块创可贴。', publicKnowledge:'她受邀为今晚的无声片现场伴奏，自称停电前后一直在茶室练琴。', secret:'录音机播放着提前录制的琴声，她实际上离开茶室取走胶片。', portraitPrompt:'Portrait of an original 29 year old Chinese woman, short straight black bob hair, ivory knit cardigan, forest green skirt, reserved expression, warm tungsten light, cinematic 35mm photograph.', topics:[
      {id:'alibi',question:'停电的时候你在哪里？',answer:'茶室。那首曲子还没练熟，我一直在弹。你应该也听见琴声了。',requires:[],reveals:[]},
      {id:'tape',question:'录音机里为什么有和刚才一样的琴声？',answer:'……那是下午录的练习。我确实出去过，但我没有想过损坏胶片。我只想先和放映的人谈谈。',requires:['piano_tape'],reveals:[]},
    ]},
    { id:'chen', name:'陈默', role:'摄影师 · 34 岁', description:'微卷黑发，深蓝工装外套，旧相机挂在肩侧，眼下疲惫。', publicKnowledge:'他来拍旅馆停业前的最后一晚，停电后在走廊测试相机。', secret:'他看见林知夏抱着铁盒，但最初不愿卷入争执。', portraitPrompt:'Portrait of an original 34 year old Chinese man, slightly curly black hair, navy work jacket, vintage camera over shoulder, tired thoughtful eyes, cinematic 35mm photograph.', topics:[
      {id:'camera',question:'今晚拍到了什么？',answer:'都是旅馆的空房间。走廊那盏灯坏了，我想等供电恢复再拍一张。',requires:[],reveals:[]},
      {id:'corridor',question:'供电记录显示灯在 23:12 恢复，你那时看到了谁？',answer:'知夏。大概三分钟后，她从放映室方向过来，怀里抱着一个圆铁盒。她让我别把这段拍进去。',requires:['power_log'],reveals:['witness']},
    ]},
    { id:'zhou', name:'周叔', role:'旅馆店主 · 58 岁', description:'灰白短发，棕色灯芯绒马甲，蓝衬衫，旧钥匙串系在腰间。', publicKnowledge:'负责旅馆电路和放映室管理，明天就要交还旅馆。', secret:'他提前知道短时停电；没有告诉客人是怕影响今晚聚会。', portraitPrompt:'Portrait of an original 58 year old Chinese innkeeper, short grey hair, brown corduroy vest and blue shirt, kind weathered face, cinematic photograph.', topics:[
      {id:'outage',question:'这次停电是意外吗？',answer:'电房设备老化，今晚本来就会切换一次线路。我把记录夹放在前台了。',requires:[],reveals:[]},
      {id:'recorder',question:'有人借过录音机吗？',answer:'知夏在十点四十借走了，说想听听自己的演奏。我以为她一直在练琴。',requires:['piano_tape'],reveals:[]},
    ]},
  ],
  scenes: [
    {id:'lobby',name:'旅馆大堂',description:'雨点敲打玻璃，前台那盏绿罩灯还亮着。电路记录夹摊在来客登记簿旁边。',requires:[],characterIds:['zhou'],imagePrompt:'Wide cinematic interior of a remote Chinese mountain inn lobby in 1998 at rainy midnight, empty reception desk with green bankers lamp, an open logbook, wet window, dark wood, amber tungsten light and deep moss green shadows, no people, no readable text.',videoPrompt:'A locked wide shot of an empty mountain inn lobby at rainy midnight. Rain trails down the window, the green desk lamp flickers once, quiet suspense. No people, no text, subtle movement.'},
    {id:'screening',name:'旧放映室',description:'供电记录让你确认备用电源恢复后门锁已经释放。放映机还温热，铁盒里只剩一张发黄的借阅卡。',requires:['power_log'],characterIds:['chen'],imagePrompt:'An old empty film projection room in a Chinese mountain hotel, vintage 35mm projector, open round film canister on wooden table, warm dusty light beam, rain outside small window, cinematic suspense, no people, no readable text.',videoPrompt:'Slow gentle push into an old empty film projection room, projector beam illuminating floating dust, an open film canister on a wooden table. Warm tungsten lighting, no readable text, no people.'},
    {id:'tea',name:'临窗茶室',description:'林知夏坐在钢琴旁，双手没有触碰琴键，房间里却仍传出同一小节。窗边的茶杯已经凉了。',requires:[],characterIds:['lin'],imagePrompt:'An empty intimate tea room in a 1998 Chinese mountain inn, upright piano with a small portable cassette recorder on top, teacup by rainy window, warm practical light, deep green curtains, cinematic 35mm film still, no people, no readable text.',videoPrompt:'A quiet fixed shot of an empty tea room, upright piano and cassette recorder, rain moving on the dark window, a green curtain sways slightly, moody cinematic light, no people, no readable text.'},
  ],
  clues: [
    {id:'power_log',name:'备用电源记录',description:'备用电源于 23:12 恢复，放映室电磁门锁同时释放。记录上保留了当值人的签字。',sceneId:'lobby',requires:[]},
    {id:'guest_book',name:'最后一晚的来客簿',description:'三人都在晚饭前登记。林知夏的备注写着：母亲曾在这里工作。',sceneId:'lobby',requires:[]},
    {id:'empty_can',name:'空胶片盒',description:'圆铁盒是空的，锁扣完好，没有暴力撬动痕迹。片盒内卡片提到一段私人访谈。',sceneId:'screening',requires:[]},
    {id:'piano_tape',name:'循环播放的磁带',description:'琴声来自钢琴上的便携录音机。磁带中同一处错音每隔两分钟重复一次，证明琴声不能作为在场证明。',sceneId:'tea',requires:[]},
    {id:'cold_tea',name:'窗边的冷茶',description:'茶杯早已没有温度。杯旁有一张未寄出的信，内容请求在公开放映前删除私人访谈。',sceneId:'tea',requires:[]},
    {id:'witness',name:'陈默的走廊证词',description:'23:15，陈默在恢复照明的走廊看见林知夏抱着圆形铁盒从放映室出来。',sceneId:null,requires:['power_log']},
  ],
  endings: [
    {id:'solved',kind:'solved',title:'雨停之前',text:'你把电源记录、重复的琴声和走廊证词连在一起。林知夏承认取走胶片，并从茶室通风柜里取回它。她请求先征求母亲同意，再放映那段私人访谈。天快亮了，雨也终于小了。'},
    {id:'wrong',kind:'wrong',title:'未完成的放映',text:'你的指认缺少完整证据，或指向了错误的人。争论盖过了雨声，胶片仍未找到。重新调查，留意哪些在场证明只是听起来可信。'},
  ],
};
