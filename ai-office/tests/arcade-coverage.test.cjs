// 每个 playground 作品都要在像素办公室里有入口（游戏室、陈列室或茶楼热点）。
// 2026-11-21 Alice 定：「我的游戏更新的话记得顺手接入我的像素办公室」。
// 新目录要么在 ai-office/index.html 里有链接，要么写进下面的 NOT_A_WORK 并给理由。
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','..');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

// 部署时改了名的目录：源码目录 → 线上路径（见 .github/workflows/pages.yml「Assemble _site」）
const DEPLOYED_AS={'aju-guangzhou-ride':'aju','shanhe-scroll':'shanhe'};
// 不是作品、不需要入口的目录
const NOT_A_WORK={
  'ai-office':'像素办公室本身',
  'tools':'共用检查脚本',
  'interaction-lab':'交互实验的规格与提示词，没有可玩页面',
  'shadow-gong-flow':'旧版跳转页，已并入 shadow-gong',
  'covers':'首页图墙的封面图',
};

test('every playground work has an entry in the pixel office',()=>{
  const dirs=fs.readdirSync(root,{withFileTypes:true})
    .filter(d=>d.isDirectory()&&!d.name.startsWith('.')&&!d.name.startsWith('_')&&d.name!=='node_modules')
    .map(d=>d.name);
  const missing=dirs.filter(d=>!(d in NOT_A_WORK)&&!html.includes(`/playground/${DEPLOYED_AS[d]||d}/`));
  assert.deepEqual(missing,[],`这些目录在像素办公室里没有入口，把链接加进 ai-office/index.html 的游戏室或陈列室，或写进 NOT_A_WORK：${missing.join(', ')}`);
});

test('skip list stays honest: every NOT_A_WORK / DEPLOYED_AS entry still exists',()=>{
  for(const d of [...Object.keys(NOT_A_WORK),...Object.keys(DEPLOYED_AS)])
    assert.ok(fs.existsSync(path.join(root,d)),`${d} 已经不存在，从名单里删掉`);
});
