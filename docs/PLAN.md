# 坦克大战无尽版 · 完善计划与进度

> 状态标记：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 已完成（构建 + 测试通过）
>
> 规则：每个任务完成后必须 `pnpm build` 通过，且相关 `pnpm test` 用例通过，才可标记 `[x]`。

---

## 第 0 期 · 测试基础设施

- [x] 0.1 引入 vitest + jsdom，配置 `vitest.config.ts` 与 `test` 脚本
- [x] 0.2 为纯逻辑模块补首批单测（types 几何函数、leaderboard 排序/截断、BulletTypes roll）
- [x] 0.3 确认 `pnpm test` 与 `pnpm build` 均通过，作为后续每个任务的验收基线

---

## 第 1 期 · 补齐硬伤与基础体验

- [x] 1.1 音效系统 `game/Audio.ts`：WebAudio 合成开火/命中/爆炸/拾取/通关/基地受击/GameOver
- [x] 1.2 静音开关：主菜单加按钮，状态存 localStorage，测试持久化读写
- [x] 1.3 暂停真正冻结：暂停时跳过物理与计时（dt 不累积到实体），测试 tick 在 paused 下不推进
- [x] 1.4 AI 躲避方向修复：`pickDodgeDir` 按子弹来向选真正垂直侧（上下/左右都能选），补单测
- [x] 1.5 AI 卡死兜底：连续移动失败时强制重选方向，避免贴墙抖动，补单测
- [x] 1.6 音效接入 Game 主循环：开火/命中/爆炸/拾取/通关等事件触发对应音效

---

## 第 2 期 · 玩法深度

- [x] 2.1 炮弹等级：重复拾取同弹种可升级（伤害/弹数/特效），数据模型 + 单测
- [x] 2.2 三选一稀有度权重：高关卡更易出高稀有，`rollPickupChoices` 加权 + 单测
- [x] 2.3 Boss 子类：高血量多炮塔，难度跃迁关（每 5 关）结尾生成，补生成逻辑单测
- [x] 2.4 持续增益道具：移速+/射速+/护盾再生，持续到本关结束，补单测
- [x] 2.5 负面事件：随机关触发（视野受限/地面打滑），补单测
- [x] 2.6 关卡地形模板：要塞战/走廊战/开阔战三种模板轮换，补生成可通行性单测

---

## 第 3 期 · 数值与平衡

- [x] 3.1 难度曲线复核：把线性公式改为可调曲线表，补边界单测
- [x] 3.2 动态难度微调：连续无伤加压/连续丢命减压，补状态机单测
- [x] 3.3 断点续玩：一局进度存 localStorage，刷新可继续，补存取序列化单测

---

## 第 4 期 · 排行榜后端化

- [x] 4.1 `RemoteLeaderboard implements LeaderboardProvider`：fetch 实现，mock fetch 单测
- [x] 4.2 Provider 切换机制：按配置在 Local / Remote 间切换，游戏侧零改动
- [x] 4.3 防作弊基础：提交前分数/关卡合理性校验 + 简单签名，补校验单测
- [x] 4.4 轻量后端服务：Node + 内存存储 + JSON 落盘，暴露 top/submit 接口（可本地运行）
- [x] 4.5 排行榜面板：全球榜/本地榜切换 + 前 1000 名分页加载

---

## 第 5 期 · 战斗体验重构

- [x] 5.1 全屏战斗页面：重排 HUD 与战场区域，地图超出视口时由安全区相机平滑跟随，并增加小地图视野框
- [x] 5.2 敌人识别体系：7 类常规敌人 + Boss，常规敌人至少 3 档升级外形，并按难度档位逐步加入编成
- [x] 5.3 敌人差异化：不同武器、装甲、机动、瞄准、闪避、目标偏好、分数倍率和掉落倾向
- [x] 5.4 基地规则调整：耐久 5-8 点成长、单次命中固定扣 1、玩家炮弹免伤、失守消耗备用生命紧急维修并获得 5 秒护盾
- [x] 5.5 战斗 HUD 增加剩余敌军显示，统计存活敌人、生成队列和未登场 Boss
- [x] 5.6 炮弹对消：敌我同种炮弹按实际伤害比较，相同伤害同时消失，高伤害保留
- [x] 5.7 炮弹系统重构：由消耗次数改为 100 点共享能量、每秒恢复 18 点，重复拾取升级并补充能量
- [x] 5.8 炮弹扩充到 14 种，补齐激光、燃烧、连锁、击退、反弹、冻结、追踪、贯穿和钢板破坏效果
- [x] 5.9 炮弹表现升级：独立弹体与轨迹、范围爆炸、电弧、燃烧、冲击波、重型开火音效
- [x] 5.10 弹跳弹修复：砖墙/钢板/边界均可反弹，反弹后同帧立即使用新方向并精确移出墙体

---

## 第 6 期 · 多人联机模式

- [x] 6.1 模式选择：单人无尽、双人无尽、10 人混战三种入口，保留单人断点续玩
- [x] 6.2 联机协议：共享房间、输入、世界、快照、结算消息类型和输入清洗
- [x] 6.3 房间服务：快速匹配、创建房间、6 位房间码加入、房主开始、离开与掉线清理
- [x] 6.4 双人无尽：共享基地/储备/关卡，友军免伤，双目标敌人 AI，无限关卡与 Boss
- [x] 6.5 10 人混战：最多 10 个独立阵营、无限复活、20 杀目标、3 分钟限时排名
- [x] 6.6 服务器权威模拟：30Hz 物理、15Hz 快照，统一处理移动、碰撞、伤害、炮弹、AI 和计分
- [x] 6.7 联机客户端：WebSocket 连接、输入同步、Canvas 渲染、相机、小地图、计分板和联机 HUD
- [x] 6.8 模块化拆分：协议、客户端、模拟基类、双人规则、混战规则、地图、武器、房间和服务接入独立维护
- [x] 6.9 多客户端验证：双浏览器房间实测 + 10 个真实 WebSocket 连接满员自动开局

---

## 变更日志

（每完成一个任务在此追加一行：任务号 · 摘要 · 构建结果 · 测试结果）

- 0.1-0.3 · 引入 vitest 4.0.18 + jsdom，配置 vitest.config.ts / test 脚本，补 types·bulletTypes·leaderboard 三组单测 · build ✓ · 28 tests ✓
- 1.1 · 音效系统 game/Audio.ts：WebAudio 合成 10 种音效配方 + AudioEngine（无 WebAudio 安全降级），补 audio 单测 · build ✓ · 37 tests ✓
- 1.2 · 主菜单静音开关（就地切换不关菜单）+ 状态持久化 + 首次手势 resume AudioContext，补 overlayMute 单测 · build ✓ · 40 tests ✓
- 1.3 · 暂停/弹窗态真正冻结：抽 loopPolicy 纯函数（advanceFlags/effectiveDt），tick 冻结世界物理与视觉特效，补 loopPolicy 单测 · build ✓ · 45 tests ✓
- 1.4 · AI 躲避方向修复：抽 dodge 纯函数（dodgeDir/bulletThreatens），按弹道偏离侧选真正垂直躲避方向，补 dodge 单测 · build ✓ · 56 tests ✓
- 1.5 · AI 卡死兜底：抽 stuck 纯函数（nextStuckCount/shouldForceRepick/escapeDir）+ Enemy.aiStuckCount，连续卡住强制垂直脱困，补 stuck 单测 · build ✓ · 66 tests ✓
- 1.6 · 音效接入 Game 主循环：抽 SoundDirector（事件→音效映射 + 节流），开火/敌火/命中/爆炸/拾取/基地受击/通关/GameOver/切弹种全接线，补 soundDirector 单测 · build ✓ · 73 tests ✓
- 2.1 · 炮弹等级：抽 BulletLevels 纯函数（applyBulletLevel/clampLevel/nextLevel，上限 Lv5），Player.bulletLevels 记录等级、spec() 按级放大，重复拾取同弹种升级（伤害/冷却/弹数/特效随级增强），HUD 弹药条 + 拾取卡展示等级/升级提示，补 bulletLevels·playerLevels 单测 · build ✓ · 94 tests ✓
- 2.2 · 三选一稀有度权重：抽 rarityWeight(rarity,stage) + PICKUP_POOL，rollPickupChoices 支持传 stage 做不放回加权采样（低关卡偏低稀有、高关卡偏高稀有），Game 拾取传入当前关，补权重单调性/加权分布单测 · build ✓ · 101 tests ✓
- 2.3 · Boss 子类：新增 boss.ts 纯逻辑（isBossStage/bossHp/bossDiagonalAngles/bossBarrageInterval/BOSS_TURRET_DIRS）+ Enemy 'boss' profile & isBoss，每 5 关清场后生成高血量 Boss（四正向齐射 + 高档位斜向弹幕），击破才通关，Renderer 加 Boss 光环，补 boss 单测 · build ✓ · 113 tests ✓
- 2.4 · 持续增益道具：抽 buffs.ts 纯逻辑（emptyBuffs/addBuff/speedMultiplier/cooldownMultiplier/regenIntervalMs/powerUpToBuff，层数封顶 3），Tank 加 speedMul/cooldownMul，新增 speed/rapid/regen 三种掉落，拾取叠一层持续到本关结束（进入下关清空），护盾再生按间隔回血，HUD 显示 buff 层数，补 buffs 单测 · build ✓ · 127 tests ✓
- 2.5 · 负面事件：抽 events.ts 纯逻辑（canTriggerEvent/eventChance/rollStageEvent/driftStep/fogRadiusPx，第 1 关与 Boss 关不触发、概率随关卡上升封顶 0.5），fog 战争迷雾（Renderer 径向遮罩只显示玩家周围）+ slippery 地面结冰（松键后惯性滑行），HUD 提示条告知本关事件，补 events 单测 · build ✓ · 141 tests ✓
- 2.6 · 关卡地形模板：抽 terrain.ts 纯逻辑（templateForStage/templateParams/corridorRows/isCorridorGap，open/corridor/fortress 三模板轮换），World.generate 按模板铺设墙密度与走廊墙，加 2 格宽连通性兜底通道，补 terrain 单测 + World 生成可通行性 BFS 验收（各关各种子敌人出生点均连通） · build ✓ · 154 tests ✓
- 3.1 · 难度曲线复核：新增 difficulty.ts 可调曲线表（CurvePoint/sampleCurve 分段线性插值 + 端点钳制），把 enemyTotal/enemyMaxOnScreen/aiTier/enemyHp/enemySpeed/enemyFireCd/enemySpawnInterval 七维难度从散落线性公式改为关键帧曲线（前期平缓/后期封顶），constants 再导出保持游戏侧单点引入，补 sampleCurve 边界 + 各维度基线/单调性/封顶单测 · build ✓ · 181 tests ✓
- 3.2 · 动态难度微调：新增 dda.ts 状态机（initialDda/registerStageClear/registerDeath，压力档位 [-2,+3]，连续 2 次无伤通关加压、连续 2 次丢命减压，互斥推进），intensityMultiplier/cadenceMultiplier 微调敌人移速/开火/生成节奏（只动连续量纲不动血量），Game 逐帧检测丢命/受创喂给状态机，HUD 显示压力/喘息档位，补状态机升降档/钳制/往返/倍率单调性单测 · build ✓ · 200 tests ✓
- 3.3 · 断点续玩：新增 storage/saveGame.ts（serializeRun/deserializeRun 纯函数 + 版本号 + 严格字段校验 + saveRun/loadRun/hasSavedRun/clearRun localStorage 安全降级），每关开头存关卡边界进度（关卡/分数/背包/等级/DDA/代号，不存战场瞬时态），主菜单出「继续上一局」按钮从本关开头续玩，Game Over 清档，补往返/损坏 JSON/版本不符/字段过滤/存取序列单测 · build ✓ · 216 tests ✓
- 4.3 · 防作弊基础：新增 storage/antiCheat.ts（scoreUpperBound/killsUpperBound 按关卡累加乐观上界估算分数/击杀天花板，validatePayload 拦截非有限/负数/关卡过小/击杀超限/分数超限，fnv1a + signPayload/verifySignature 共享盐确定性签名，前后端可复算），补上界单调性/合理提交放行/伪造拦截/签名往返单测 · build ✓ · 233 tests ✓
- 4.1 · RemoteLeaderboard：新增 storage/remoteLeaderboard.ts（implements LeaderboardProvider，GET /top·POST /submit·POST /clear，AbortController 超时，2xx 校验 + 响应容错 extractEntries/extractEntry，提交前本地 validatePayload + 附签名），补 mock fetch 的 top/submit/clear/超时/非 2xx/本地拦截/响应容错单测 · build ✓ · 244 tests ✓
- 4.2 · Provider 切换机制：新增 storage/leaderboardConfig.ts（readLeaderboardConfig 纯函数按 VITE_LEADERBOARD_MODE/URL 解析、非法或缺 URL 安全回退 local，resolveLeaderboardConfig 读 import.meta.env），leaderboard.ts 据配置装配 localLeaderboard/remoteLeaderboard/leaderboard 三导出（游戏侧只认 leaderboard，切后端零改动），补 mode/url 组合与回退单测 · build ✓ · 253 tests ✓
- 4.4 · 轻量后端服务：新增 server/（store.ts 内存排序截断 + 可注入 persist/idGen/now；api.ts 传输无关 handleRequest 复用 antiCheat 合理性+签名校验，服务端权威生成 id/createdAt；index.ts node:http 零依赖入口 + JSON 落盘 + body 上限 + CORS + /clear 开关），加 server npm 脚本，补 store 排序/截断/校验 + api top/submit/伪造拦截/签名/clear 开关/路由单测 · build ✓ · 275 tests ✓
- 4.5 · 排行榜面板：新增 game/pagination.ts（paginate/pageSlice 纯函数，越界钳制），Overlay.showLeaderboard 重构为全球榜/本地榜页签切换（无全球榜隐藏页签）+ 每页 20 条前 1000 名分页（‹›/←→ 翻页，切页签缓存不重复请求，失败降级空表），补 style.css 页签/分页样式，补 paginate/pageSlice 边界单测 · build ✓ · 287 tests ✓
- 5.1 · 全屏战斗页面与相机：HUD 分区显示战区/分数/击破/剩余敌军/生命/基地/武器能量，Camera 使用安全区平滑跟随大地图，Renderer 增加小地图与视野框 · build ✓
- 5.2-5.3 · 敌人识别与差异化：新增 scout/gunner/brute/sniper/raider/demolisher/commander 七类常规敌人及 3 档升级外形，接入武器、装甲、速度、闪避、目标偏好、掉落和难度编成 · build ✓
- 5.4-5.5 · 基地与剩余敌军：基地耐久随关卡从 5 成长到 8，失守优先消耗备用生命并半血维修、获得 5 秒护盾；HUD 统计场上、队列和 Boss 剩余数量 · build ✓
- 5.6 · 炮弹对消：同种敌对炮弹按升级后的实际伤害判定，相等双消、高伤害保留，不同弹种和同阵营不互相抵消，补 bulletCollision 单测 · build ✓
- 5.7-5.9 · 炮弹系统重构：特殊炮弹改为共享能量制（100 上限、18/秒恢复），扩充至 14 种并接入燃烧/连锁/击退/激光/冲击波/磁轨等逻辑、渲染与音效，旧存档自动迁移，补 bulletEffects 等回归测试 · build ✓ · 323 tests ✓
- 5.10 · 弹跳弹修复：反弹优先于墙体破坏，支持砖墙/钢板/边界；逐子步读取反弹后的速度并精确移出碰撞面，避免同帧卡墙耗尽次数，补 bounceBullet 单测 · build ✓ · 326 tests ✓
- 6.1-6.3 · 新增模式选择与联机大厅，支持双人/10 人模式的快速匹配、创建房间、房间码加入、房主开始和掉线清理；共享 protocol 类型与服务器输入校验 · build ✓
- 6.4-6.6 · 新增服务器权威联机模拟：双人共享基地与储备、混战独立阵营与复活计分，复用现有 World/Tank/Bullet/EnemyAI/14 种武器，30Hz 推进并广播快照 · build ✓
- 6.7-6.8 · 联机客户端按 OnlineClient/OnlineSession/OnlineRenderer/OnlineHUD/OnlineOverlay 拆分；模拟按 Base/Duo/Brawl/OnlineTank/maps/combat 模块拆分，房间服务按 Room/RoomManager/MultiplayerServer 拆分 · build ✓
- 6.9 · 补 multiplayerProtocol/onlineSimulation/multiplayerRooms 测试，并完成双浏览器组房开局与 10 WebSocket 满员匹配实测 · build ✓ · 334 tests ✓
