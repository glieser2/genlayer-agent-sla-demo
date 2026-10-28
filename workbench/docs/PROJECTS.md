# Projects 候选材料：Agent SLA Workbench

当前为本地应用、真实Studionet部署及评估成果，**尚未正式提交或获批Projects**。

## 项目与用途

用户上传交付证据，在浏览器检查结构、部署不可变SLA证据包、通过GenLayer执行语义判断，并按标准复核状态及引用。GenLayer负责C3/C4语义评估与验证者对照，前端不替网络生成判断。C1/C2检查由同一合约给出，浏览器预览明确标记为本地检查。

完整前端源码、合约、测试及锁文件已备好。当前直接MetaMask写入因Studio零地址派发不兼容而拦住；已验证的真实部署与assess由用户在官方Studio内置测试账户完成。不能宣称本前端的MetaMask写入已端到端验证。

## 当前已验证

- 本地生产构建及类型检查通过。
- 18项逻辑测试、11项界面检查和12项模拟钱包检查通过。
- 稳定Studionet链ID61999匹配；源码schema含assess/get_result/get_snapshot。
- 合约：https://explorer-studio.genlayer.com/address/0x12de9d0F0CEFC3697e76656A3b520c302e17faE9
- 部署：https://explorer-studio.genlayer.com/tx/0x6cd7a290558ab19549cbebd5d794c85e59cf72309d196ebd76cca8adf679280b
- assess：https://explorer-studio.genlayer.com/tx/0x4af53904b20f6581db81e7669c44f67a974e35595d3064b4e089dd9cb2b05106
- 两笔均FINALIZED且FINISHED_WITH_RETURN，类型分别1与2；同一内置测试账户执行。源码SHA256为9bab25a9f898d20ec6af13f0e34aa19d395998f973a592d379726e48304dd912，与原审核源码完全相同。
- 冻结输入与已审核的SYNTHETIC-WEBSITE-001一致，不是实际客户网站测量。真实网络结果为C1满足，C2/C3/C4未满足，包含引用；负面结论不是交易失败。
- 本地前端无钱包环境通过真实RPC读取并渲染四项结果，已核对源码与引用，见preview-live-result.png。只读验证脚本没有发送交易。
- 尚无新前端公开链接、Projects投稿或Steward接受记录；未配置或支付个人模型API费用。

## 正式投稿前仍缺的实际证据

1. 已完成授权的单次部署和assess；不要重复执行。开发网可重置，不是Bradbury部署，不保证Portal接受任意网络。
2. 核实Projects是否接受Studionet、内置账户及当前外部Studio写入流程；不能从Intelligent Contracts类别推定。
3. 发布审查过的新应用源码及可访问应用，固定版本和提交SHA；原16文件公开仓库不是此新前端已经发布的证据。
4. 人工查看Projects完整指南与表单所需证据类型，提供实际应用、源码和合约链接，不用Intelligent Contracts类别要求去猜测Projects全部要求。
5. 用户人工提交Portal，保存My Submissions状态及完整ID，之后分别记录审核与积分。不能保证奖励区间中的任何数额。

## 标题草稿

Agent SLA Workbench: evidence-linked delivery assessment on GenLayer

## 描述草稿（公开链接补齐后再提交）

AI-assisted browser workbench for reviewing delivery evidence against a fixed SLA rubric. One AgentSLAAdjudicator contract was deployed on Studionet (61999), with one full-consensus assess call finalized successfully. Reviewed source and frozen synthetic input were checked through public RPC. The result is C1 met; C2/C3/C4 not met, with evidence references. The frontend imports evidence, validates structure, previews deterministic criteria, checks deployed source, reads actual results, and tracks transactions. Writes were demonstrated in official Studio with its built-in test account; direct MetaMask writes remain blocked by zero-dispatcher incompatibility. Inputs are synthetic. No escrow, settlement, evidence authentication or legal adjudication. New frontend hosting and publication remain pending.

此段尚不是已完成投稿声明。应用链接缺失时不填造假占位URL；公开后改用实际链接，仍需核对类别要求及账户归属。
