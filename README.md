# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## OpenAPI 契约（消费侧）

后端契约由 backend 仓导出（`backend/spec/openapi/drone-backend.openapi.json`），本仓 **vendor + sha256 对账 + 生成物入库**。
决策见 `../docs/adr/0004-OpenAPI契约流水线与消费端接入.md`。

```
openapi/drone-backend.openapi.json    # vendor 进来的规格（唯一事实源副本）
openapi/drone-backend.openapi.sha256  # 对账文件
src/api/generated/openapi.d.ts        # openapi-typescript 生成物（禁止手改）
src/api/contract.ts                   # 契约类型门面：apiGet/apiPost/apiPut/apiDelete/expectData
```

| 目的 | 命令 |
|---|---|
| vendor + 生成 + 对账 | `pnpm api` |
| 只对账 sha256 | `pnpm api:check` |
| 契约/单测门禁 | `pnpm test`（含 `tests/unit/openapi-contract.spec.ts`） |
| 类型门禁 | `pnpm exec vue-tsc -b`（`pnpm build` 已包含） |

写调用点的固定动作：

1. 在 `src/api/modules/*.ts` 里用契约路径写字面量：`apiGet('/webUav/status', { params: { deviceId } })`；
2. 后端结构一律从 `Schemas['…']` 派生（`src/types/*.ts` 只保留前端视图模型）；
3. 把该端点登记进 `tests/unit/openapi-contract.spec.ts` 的 `CALLED_OPERATIONS`——漏登记会让契约门禁失去意义；
4. 端点不存在或参数不符时**先改后端注解并重新导出**，不要在本地绕过。
