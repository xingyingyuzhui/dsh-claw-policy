# dsh-agent-policy · 策略契约

治理套件 **Phase 1–2** 的共享契约：policy schema、预设基类、MCP 初始化默认、策略版本。**不拦截工具。**

其它插件只消费这份 schema，不要再复制一份方言。卸掉本插件不会放宽权限——闸还在 `dsh-agent-gate`，缺省回落到 DSH 原有 permission-presets。

MCP 工具名是 `mcp__<服务>__<工具>`。`none` 全关；`explicit` 只放行 `servers.allow`；`init-defaults` 在名单为空时放行。真正拒绝和隐藏在闸里。

## 安装

```sh
dsh plugin --profile web add github:xingyingyuzhui/dsh-agent-policy
```

建议装在 `dsh-agent-registry` / `dsh-session-permissions` / `dsh-agent-gate` 前面。装完重启 `dsh web`。

本地开发：

```sh
dsh plugin --profile web add link:/abs/path/to/dsh-agent-policy
```

## 数据

写在 `~/.dsh/agent-policy/defaults.json`：

- `preset`：新建 Claw Agent 的常驻模板（`research` / `developer` / …）。设置里叫 **Claw Agent模板**
- `mcp`：`none` | `explicit` | `init-defaults`（新 Agent 的 MCP 面默认值）
- `servers.allow` / `servers.deny`：初始化可见的 MCP 服务名

`BOOTSTRAP.md` 还在时，闸额外放行问名字和写本工作区人设文件；不在这份默认里放宽终端。

## 卸载

```sh
dsh plugin --profile web remove dsh-agent-policy
```

已写出的 `defaults.json` 会留在磁盘上。

## License

MIT
