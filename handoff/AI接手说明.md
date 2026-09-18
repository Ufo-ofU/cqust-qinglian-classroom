# AI接手说明

## 1. 产品背景与范围

学校：重庆科技大学。军训期间廉洁教育活动，暂定60分钟，预计4700余名新生，多教室单向同步直播。
主讲教师看不到分会场学生；网页用于收集回答，替代举手统计。
主题：大学第一课——让廉洁成为青春底色。
主色：#931A6A，参考学校官网样式。学校Logo由用户提供，位于public/brand/。
当前界面为简体中文，手机学生端优先，教师端和投屏端适配电脑。不要自行增加实名考试、考勤或排行榜。

## 2. 交付与线上状态

当前网址：https://cqust-qinglian-classroom.luozhenxi2006.chatgpt.site
教师入口：/teacher
展示入口：/screen?code=六位课堂码
源码版本：ef12765d7a60d63e1681a4217982aafb7be62d18
Sites项目：appgprj_6aace4c00b9c8191a2f77e4f90bab29d
已发布版本：1
版本ID：appgprj_6aace4c00b9c8191a2f77e4f90bab29d~appgver_282c45b8c8b0819189a3c713da6e775b
部署ID：appgdep_6aacea5696448191b39ee6b4b3b7f175
已确认发布成功；交接时访问范围仍为所有者私有。访问网站本身需要平台账户权限，教师口令不能绕过平台访问限制。

此包是源码快照，不是Git仓库克隆，不包含线上数据库或本地测试数据库。迁移只创建表，不会带入之前的课堂码或回答。截图中的课堂码不能用于线上。
导出与文档整理未改动线上应用，因此未发布新版本。

## 3. 技术与关键文件

React 19.2.6、TypeScript、Vinext 1.0.0-beta.5、Vite 8、Tailwind CSS 4，后端为Cloudflare Worker；D1为托管SQLite数据库；Drizzle只负责schema和迁移，运行时使用D1预处理SQL。
package.json中的Next依赖为框架兼容组成部分，不要无依据改成next dev或纯静态导出。

| 文件 | 职责 |
| --- | --- |
| app/page.tsx | 学生入口 |
| app/teacher/page.tsx | 教师入口 |
| app/screen/page.tsx | 投屏入口 |
| app/classroom.tsx | 三种模式共享UI、轮询、表单、二维码、状态变化 |
| app/globals.css | 学校配色、响应式、投屏和手机样式 |
| app/layout.tsx | 中文语言、标题、图标、禁止索引元数据 |
| lib/questions.ts | 三个案例、选项、正确处理方式与点评；服务端使用 |
| lib/classroom-server.ts | D1访问、签名Cookie、教师与学生会话、公开数据裁剪 |
| app/api/classroom/[action]/route.ts | 课堂、投票、教师控制API |
| db/schema.ts | sessions、votes、login_attempts |
| drizzle/ | 数据库迁移与元数据 |
| vite.config.ts | Vinext、Cloudflare本地绑定、Sites构建插件 |
| .openai/hosting.json | 原Sites项目标识与DB逻辑绑定 |
| public/brand/ | 用户提供的白色及深色Logo |
| scripts/ | 运行、安装及执行环境辅助脚本 |

components/ui/等多数是保留的starter组件，本次主要UI使用app/classroom.tsx和lucide-react图标。
scripts/cache-state.cjs是此前的一次性源码修改辅助脚本，不属于安装、构建或启动流程，不必运行。

## 4. 业务流程与状态

教师登录 → 创建课堂 → 显示二维码及课堂码 → 开放本题 → 学生提交 → 教师收题 → 公布结果与解析 → 下一题。
状态机为waiting → open → closed → revealed；前两题可从revealed进入下一题waiting；课堂可结束为ended。
教师端只管理最近一场课堂，设计为同一时间一场活动。创建新课堂前须结束旧课堂。

学生无需账号或姓名学号；服务端签发12小时HttpOnly、SameSite=Strict的签名Cookie，HTTPS下设置Secure。
votes主键为(session, question, participant)，重复提交保留首份选择。回答一旦提交不能修改。
“是否open且为当前题”检查与插入处于同一条INSERT SELECT语句，防止收题后的迟到提交。
公开API仅在revealed或ended阶段返回正确选项、点评及票数；教师API可预览计票。
学生轮询约6至8秒，教师及投屏约2.5至4.5秒。公共state有最多2秒边缘缓存；网络错误时延迟重试，上限30秒。不是WebSocket实时推送。
有只读WebMCP工具read_classroom_state，浏览器不支持时安全跳过；真实支持环境中的WebMCP验证未完成。

## 5. API速查

GET /api/classroom/teacher：需教师Cookie，返回最近课堂及计票。
GET /api/classroom/state?code=...：公开课堂状态，公布前隐藏统计和解析。
GET /api/classroom/mine?code=...：读取本浏览器当前题已提交选项。
POST /api/classroom/login：{key}，教师口令验证并签发Cookie。
POST /api/classroom/logout：注销教师Cookie。
POST /api/classroom/create：{}，创建六位课堂码。
POST /api/classroom/join：{code}，签发或刷新匿名学生Cookie。
POST /api/classroom/vote：{code, question, choice}，question与choice均为0至2整数。
POST /api/classroom/control：{code, revision, command}，command为open/close/reveal/next/end。
写请求要求Origin与请求URL来源一致；API脚本测试须设置Origin。教师控制有revision条件更新，防止使用旧状态覆盖新状态。

## 6. 本地启动

使用Node.js >=22.13，已验证的原环境为Windows、Node 24.18.1、PowerShell及本机Edge。清洁源码默认使用portable执行模式。
在website目录执行以下步骤，不要在压缩包里直接运行。

1. 安装锁定依赖：

    npm run install:ci

2. 生成仅用于本地测试的密钥文件。下面命令只用于新建环境；已有.dev.vars时不要直接覆盖：

    node -e "const fs=require('node:fs'),c=require('node:crypto');if(fs.existsSync('.dev.vars'))throw Error('.dev.vars already exists');fs.writeFileSync('.dev.vars','TEACHER_KEY='+c.randomBytes(12).toString('base64url')+'\nSESSION_SECRET='+c.randomBytes(32).toString('hex')+'\n');"

可在本地查看.dev.vars中的TEACHER_KEY用于登录；不要把它提交或粘贴到公开对话。包内.dev.vars.example仅说明字段，不含真实值。
.env.example并不是教师口令的实际本地读取位置；Wrangler本地读取.dev.vars。

3. 构建生成本地Worker配置：

    npm run build

4. 仅对空的本地数据库按顺序应用迁移：

    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wild_cerise.sql

不要重复执行已应用的迁移。不要将命令改为--remote。本地和生产数据库是分开的。

5. 启动：

    npm run dev

默认起始地址为http://localhost:5173，以进程实际输出为准。先打开/teacher登录并创建课堂，再打开学生页测试。
若要测试构建后的Worker，可运行npm start并使用其打印的地址。

6. 类型检查：

    node node_modules/typescript/bin/tsc --noEmit

Windows兼容提示：
原环境中Sites辅助脚本调用npm.cmd时曾出现npm-cli.js解析到项目目录的问题。不是业务代码缺失；直接运行npm脚本或以下命令可继续：

    node scripts/run-framework.mjs build
    node scripts/run-framework.mjs dev

若npm入口本身异常，定位当前机器npm-cli.js，用node加其绝对路径执行npm命令。不要照抄原用户的机器路径。
不得因为辅助命令异常删除锁文件、重装整个架构或抹掉数据库。

## 7. 接续部署

若AI所在环境有Sites工具及对应用户权限：
- 先读取网站技能和.openai/hosting.json，复用既有项目，先get_site识别现有站点。
- 保留DB绑定和已应用的drizzle迁移；新增schema变化须新建迁移。
- 通过工具续取源仓库写入凭据，最好克隆当前源仓库分支后再应用修改；本ZIP没有.git历史。
- 编译、提交和推送精确源码，再保存并部署版本。
- 网站密钥TEACHER_KEY和SESSION_SECRET已经在托管端配置，不要用本地测试值覆盖。
- 网站默认私有；开放给学生应由用户明确确认。不要为发布而擅自改变受众。
- 等部署终态成功后才告知已上线。

若没有Sites权限：
可完整接手代码和本地测试，但无法仅凭这个ZIP更新原网址。明确告诉用户需要原平台授权，或在用户同意后迁移至支持Cloudflare Workers+D1的托管环境。
迁移前要处理平台适配、数据库导出/导入、域名及密钥迁移；普通静态空间不能运行本项目的服务端和D1。
不要伪造网址或把localhost当成其他学生可访问的网址。

## 8. 测试证据与边界

handoff/qa-result.json记录此前12类功能检查，包含桌面/手机显示、教师登录、创建课堂、加入、投票、幂等、隐藏答案、拒绝未授权控制、收题拒绝、公布、刷新恢复、切题。
handoff/load-result.json记录本地模拟：4700份回答，50个并行请求，4700成功，0错误，39.788秒，P95 505ms；100次重复重试后总数保持4700。
压力脚本通过本地签名密钥生成测试学生Cookie，重点验证投票API和计票，不模拟4700台真实手机的扫码、入场、轮询、浏览器渲染和校园网络。
测试数据只在本地数据库，未上传为真实课堂回答。
功能检查使用过本地Edge；实际微信内置浏览器及国内校园网络尚未验证。
本地开发控制台曾出现框架hydration/context警告，页面交互测试通过；接手时仍应在构建后的Worker中复查，不应宣称完全没有浏览器警告。

## 9. 正式活动前需要完成

- 用户确认学生访问范围并开放；评估实际国内网络可达性。
- 在正式托管环境授权范围内做并发、轮询及集中提交压力测试，核验配额、费用与D1限制。
- 在各教室测试Wi-Fi或手机网络、微信扫码及直播延迟，安排分批扫码。
- 核实学校手机使用安排、教师/工作人员培训与故障预案。
- 审核三个案例、选项及点评；目前均为拟用教学情境。
- 课堂数据留存、清理和必要导出方式尚未设计；目前没有导出、题库编辑或历史课堂管理UI。
- 匿名Cookie只限制同一浏览器，无法防止换设备/清Cookie重复作答；不能做实名考勤。
- 多名教师同时创建课堂的极端竞态尚未进行专项测试，单场限制目前为应用层检查；六位课堂码罕见碰撞会报错而非自动重试。
- 若增加题目数量，要同步检查前后端多处固定三题的校验、界面及结束条件，不只修改questions数组。

## 10. 推荐接手顺序

先读文档和代码 → 本地跑通教师与学生端 → 确认用户这次修改范围 → 修改 → 验证权限、幂等、收题边界和移动布局 → 经授权发布。
保留用户已选定的视觉方向和活动内容；需要大幅改架构时先说明理由。

