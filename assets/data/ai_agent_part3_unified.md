# 面试题库（统一格式）

---

### Q: 什么是 Structured Output（结构化输出）？如何保证 LLM 输出严格符合 JSON Schema？

**🏢 高频公司**：字节、阿里、小红书

**答案**：

生产中最可靠的结构化输出方案是 Function Calling：定义工具的 JSON Schema，让模型调用工具，输出的参数天然满足 schema，API 层面就做了约束，不需要额外解析。对于需要 100% 格式保证的场景，constrained decoding 是终极方案，在 token 采样阶段用有限状态机过滤不合法的 token，但需要推理框架支持（vLLM 的 guided_json）。Instructor 是工程上很好用的封装，用 Pydantic 定义返回类型，自动处理格式错误重试，几行代码就能获得类型安全的 LLM 输出。

**考察点**：

1. Function Calling 为什么比 prompt 约束更可靠
2. Constrained decoding 的实现原理（有限状态机 + token mask）
3. Instructor 库的内部实现（多次重试 + 错误反馈）

---

### Q: 什么是 LLM 的 Tool Use 并行调用（Parallel Tool Use）？如何利用它提升 Agent 速度？

**🏢 高频公司**：字节、腾讯、MiniMax

**答案**：

Parallel Tool Use 是 Agent 性能优化的重要手段。Claude 可以一次回复输出多个 tool_use block，客户端用 asyncio.gather 并发执行，再将所有结果组成 tool_results 列表一起送回。这把 N 次独立工具调用的延迟从 O(N × LLM_latency) 压缩到近似 O(2 × LLM_latency)（一次决策 + 一次综合）。在 LangGraph 里可以用 Send API 实现并行节点：把工具调用列表拆分，每个工具调用 Send 到一个并行节点，所有节点完成后汇总到下一个节点。关键判断是哪些调用可以并行——查天气和查股价完全独立，可以并行；但"先查用户余额再决定推荐策略"有数据依赖，必须串行。

**考察点**：

1. 哪些工具可以并行（独立性判断）
2. 并行调用的错误处理（部分失败时的处理）
3. 在 LangGraph 中实现并行工具节点

---

### Q: 解释 LLM 的 Context Length vs Knowledge Cutoff 的区别，以及各自的工程应对

**🏢 高频公司**：字节、小红书、阿里

**答案**：

Context Length 是推理时的技术限制（当前请求能看到多少 token），Knowledge Cutoff 是训练时的数据限制（模型知道截止什么时候的信息）。两者的解决方案不同：Context Length 问题用 RAG（只传相关片段）、摘要压缩（压缩历史对话）解决；Knowledge Cutoff 问题用 RAG + 实时搜索工具解决，让模型能查到最新信息。Agent 工程上要同时处理两个：用 tiktoken 实时估算 context 使用量，接近上限时触发摘要；同时给 Agent 配备搜索工具，遇到可能超出训练数据的问题（近期事件、实时数据）主动调用搜索。

**考察点**：

1. 两者的根本区别（训练时 vs 推理时的限制）
2. 如何在 Agent 里检测上下文即将超限（预计算 token 数）
3. 知识截止日期问题的多种解决方案

---

### Q: 什么是 Hypothetical Document Embedding（HyDE）？它如何提升 RAG 的召回率？

**🏢 高频公司**：小红书、字节、阿里

**答案**：

HyDE 的洞察是：查询语言和文档语言有风格差距，直接用查询做向量检索会有系统性的 semantic gap。生成一个"假如我知道答案它大概长什么样"的假设性文档，再用这个文档去检索，因为和实际文档的风格、术语更一致，embedding 相似度更高。代价是多一次 LLM 调用，用 claude-haiku 可以控制在 50ms/次的额外延迟。实际测试，对于"如何解决 X 问题"这类查询，HyDE 召回率比直接检索高 15-20%；但对于已经是关键词风格的查询（"量子计算 叠加态 原理"），HyDE 的增益不明显。可以用查询分类器先判断查询类型，复杂询问式查询走 HyDE，关键词式查询直接检索。

**考察点**：

1. 为什么 hypothetical document 比 query 更接近真实文档
2. HyDE 的适用场景（长尾查询、专业术语查询）
3. 与 Multi-Query 的组合使用

---

### Q: LangGraph 的 Interrupt 和 Command 机制详解，Human-in-the-Loop 的三种模式

**🏢 高频公司**：字节、小红书

**答案**：

LangGraph 的 interrupt() 是 HITL 的核心机制，它在节点内部暂停图执行，把中间状态（通过 Checkpointer 持久化到 DB）和 interrupt value（需要用户决策的内容）返回给调用方，调用方可以展示给用户并等待；用户决策后通过 `Command(resume=...)` 恢复执行，图从 interrupt 点继续。三种模式中"审批"最简单，只需 approve/reject；"编辑"让用户直接修改中间产物（如日报草稿）然后继续；"澄清"让 Agent 主动提问解决歧义，类似多轮对话但嵌入在 graph 流程里。关键工程细节是 thread_id 管理——每个用户会话有唯一 thread_id，所有 checkpoint 都用这个 ID 存取，服务端无状态，任意实例都能恢复任意 session。

**考察点**：

1. interrupt() 和 checkpointer 的配合（状态如何持久化）
2. stream_mode 下的 interrupt 处理
3. 多 interrupt 节点的图设计（串行审批流）

---

### Q: 什么是 AI Agent 的"幻觉检测"？有哪些主动检测和被动防御手段？

**🏢 高频公司**：MiniMax、字节、阿里

**答案**：

幻觉检测分事前和事后。事前防御：RAG 系统里 system prompt 明确限制"只基于以下文档回答，无法回答时明确说不知道"，Temperature 设为 0 减少随机创造；要求回答时标注来源段落编号，方便后续验证。事后检测：将模型回答拆解为原子声明，用 NLI 模型或 LLM 逐条验证是否能从 context 推断（RAGAS Faithfulness）；也可以用 Self-Check——生成答案后让同一模型（或更强的模型）审查"哪些内容无法从提供的文档中确认"。生产监控上，抽样 5% 的请求做 faithfulness 检测，低分对话进入人工复查队列。发现幻觉集中在某类问题（如数字、日期类）后，可以针对性加强那类问题的 RAG 检索或在 prompt 里加特别提醒。

**考察点**：

1. 引用幻觉的检测（Citation Grounding）
2. 知识幻觉 vs 引用幻觉的不同处理策略
3. 幻觉率的监控指标设计

---

### Q: Agent Memory 的 Write-Back 策略和记忆遗忘机制如何设计？

**🏢 高频公司**：小红书、字节

**答案**：

记忆写入最好异步，不阻塞主响应路径。实现上用 `asyncio.create_task` 启动后台任务，或者发 Kafka 消息让专门的记忆服务处理。提取什么记忆是关键：不是所有对话都值得记录，只提取"用户偏好"、"重要事实"、"决策结果"类信息，普通闲聊不存。记忆的生命周期管理：重要信息（用户的忌口、工作单位）设较长 TTL 或永久；普通偏好（"上次喜欢的餐厅"）设 30 天 TTL。记忆去重很关键，不能无限追加——用 embedding 相似度判断新记忆是否与已有记忆重复，重复则更新而非追加，避免记忆库无限膨胀。在 Critter 项目里我实现了这套机制：按类别（饮食/工作/爱好）分类存储，同类新信息覆盖旧信息，用 json 文件持久化，每次对话注入 system prompt。

**考察点**：

1. 异步写入的可靠性保证（消息队列 vs fire-and-forget）
2. 记忆去重（向量相似度判断是否是同类信息）
3. 记忆隐私和合规（敏感信息不应存入长期记忆）

---

### Q: 如何设计多 Agent 系统的错误恢复和任务重试机制？

**🏢 高频公司**：字节、腾讯

**答案**：

多 Agent 系统的错误恢复分三层。工具级：用 tenacity 的指数退避重试，只重试幂等操作（查询类），写操作必须先加幂等 ID 再重试。任务级：LangGraph Checkpointer 在每个节点执行后保存完整 state，失败时从最后成功节点恢复，不需要从头重跑。服务级：对外部工具调用加 Circuit Breaker，连续失败超阈值时熔断（短路），避免雪崩，定时探测恢复。设计原则是"让 Agent 感知错误并自主决策降级"：工具超时时，Agent 应该在下一个 Thought 里感知到（通过 tool_result 里的错误信息），自主选择备用方案或告知用户"该功能暂时不可用"，而不是对用户完全无响应。

**考察点**：

1. 幂等性对重试的重要性（重试前必须保证操作幂等）
2. Circuit Breaker 三态（Closed/Open/Half-Open）
3. LangGraph Checkpointer 的断点恢复机制

---

### Q: 如何设计 LLM 应用的多租户隔离（Multi-tenant）架构？

**🏢 高频公司**：阿里、腾讯

**答案**：

多租户 LLM 架构的核心是数据和配置的严格隔离。向量数据库上，小租户用共享 Collection + metadata filter（省钱），大租户或安全要求高的给独立 Collection（强隔离）。System prompt 从数据库动态加载，每个租户有独立配置（bot 名字、人格、公司信息），热更新不需要重启服务。限流按 tenant_id 维度用 Redis 令牌桶，防止单个租户打垮整个服务。成本归因必须在 LLM 调用层记录，写入 ClickHouse，支持按租户、按日期、按模型多维度分析。最重要的安全原则：不同租户的对话上下文绝对不能混入，每次请求只携带当前租户的 system prompt 和知识库内容，禁止跨租户的任何信息传递。

**考察点**：

1. Collection 隔离 vs 共享 Collection + filter（成本 vs 严格隔离）
2. 配置的热更新（不重启服务修改租户配置）
3. 跨租户数据泄露的防御（注意 LLM 上下文污染）

---

### Q: 什么是 Agent 的"计划-执行"模式（Plan-and-Execute）？与 ReAct 有何区别？

**🏢 高频公司**：字节、MiniMax

**答案**：

ReAct 每步都做即时决策，灵活但效率有限（每步都要 LLM 推理）；Plan-and-Execute 先花一次 LLM 调用生成完整计划，后续执行 Agent 按计划跑，对于长任务总体 LLM 调用次数更少，且计划可以识别并行步骤。实践中，对于"帮我研究一个主题并写报告"这类需要 10-20 个子任务的复杂请求，Plan-and-Execute 效果更好；对于"帮我查一下天气然后推荐穿衣"这类简单 2-3 步任务，ReAct 更合适（不需要规划开销）。重规划（Replan）是 Plan-and-Execute 的关键补丁：当执行结果与预期偏差较大时，触发 replanner 重新生成后续计划，保证最终目标还能完成。在 LangGraph 里，条件边判断"计划是否完成"和"是否需要重规划"，实现自适应的计划执行。

**考察点**：

1. 何时应该重规划（Replan）
2. Plan 的粒度设计（太细则限制了执行 Agent 的自由度）
3. LangGraph 实现 Plan-and-Execute 的图结构

---

### Q: 什么是 Structured Output（结构化输出）？如何保证 LLM 输出严格符合 JSON Schema？

**答案**：

生产中最可靠的结构化输出方案是 Function Calling：定义工具的 JSON Schema，让模型调用工具，输出的参数天然满足 schema，API 层面就做了约束，不需要额外解析。对于需要 100% 格式保证的场景，constrained decoding 是终极方案，在 token 采样阶段用有限状态机过滤不合法的 token，但需要推理框架支持（vLLM 的 guided_json）。Instructor 是工程上很好用的封装，用 Pydantic 定义返回类型，自动处理格式错误重试，几行代码就能获得类型安全的 LLM 输出。

**考察点**：

1. Function Calling 为什么比 prompt 约束更可靠
2. Constrained decoding 的实现原理（有限状态机 + token mask）
3. Instructor 库的内部实现（多次重试 + 错误反馈）

---

### Q: 什么是 LLM 的 Tool Use 并行调用（Parallel Tool Use）？如何利用它提升 Agent 速度？

**🏢 高频公司**：字节、腾讯、MiniMax

**答案**：

Parallel Tool Use 是 Agent 性能优化的重要手段。Claude 可以一次回复输出多个 tool_use block，客户端用 asyncio.gather 并发执行，再将所有结果组成 tool_results 列表一起送回。这把 N 次独立工具调用的延迟从 O(N × LLM_latency) 压缩到近似 O(2 × LLM_latency)（一次决策 + 一次综合）。在 LangGraph 里可以用 Send API 实现并行节点：把工具调用列表拆分，每个工具调用 Send 到一个并行节点，所有节点完成后汇总到下一个节点。关键判断是哪些调用可以并行——查天气和查股价完全独立，可以并行；但"先查用户余额再决定推荐策略"有数据依赖，必须串行。

**考察点**：

1. 哪些工具可以并行（独立性判断）
2. 并行调用的错误处理（部分失败时的处理）
3. 在 LangGraph 中实现并行工具节点

---

### Q: 解释 LLM 的 Context Length vs Knowledge Cutoff 的区别，以及各自的工程应对

**🏢 高频公司**：字节、小红书、阿里

**答案**：

Context Length 是推理时的技术限制（当前请求能看到多少 token），Knowledge Cutoff 是训练时的数据限制（模型知道截止什么时候的信息）。两者的解决方案不同：Context Length 问题用 RAG（只传相关片段）、摘要压缩（压缩历史对话）解决；Knowledge Cutoff 问题用 RAG + 实时搜索工具解决，让模型能查到最新信息。Agent 工程上要同时处理两个：用 tiktoken 实时估算 context 使用量，接近上限时触发摘要；同时给 Agent 配备搜索工具，遇到可能超出训练数据的问题（近期事件、实时数据）主动调用搜索。

**考察点**：

1. 两者的根本区别（训练时 vs 推理时的限制）
2. 如何在 Agent 里检测上下文即将超限（预计算 token 数）
3. 知识截止日期问题的多种解决方案

---

### Q: 什么是 Hypothetical Document Embedding（HyDE）？它如何提升 RAG 的召回率？

**🏢 高频公司**：小红书、字节、阿里

**答案**：

HyDE 的洞察是：查询语言和文档语言有风格差距，直接用查询做向量检索会有系统性的 semantic gap。生成一个"假如我知道答案它大概长什么样"的假设性文档，再用这个文档去检索，因为和实际文档的风格、术语更一致，embedding 相似度更高。代价是多一次 LLM 调用，用 claude-haiku 可以控制在 50ms/次的额外延迟。实际测试，对于"如何解决 X 问题"这类查询，HyDE 召回率比直接检索高 15-20%；但对于已经是关键词风格的查询（"量子计算 叠加态 原理"），HyDE 的增益不明显。可以用查询分类器先判断查询类型，复杂询问式查询走 HyDE，关键词式查询直接检索。

**考察点**：

1. 为什么 hypothetical document 比 query 更接近真实文档
2. HyDE 的适用场景（长尾查询、专业术语查询）
3. 与 Multi-Query 的组合使用

---

### Q: LangGraph 的 Interrupt 和 Command 机制详解，Human-in-the-Loop 的三种模式

**🏢 高频公司**：字节、小红书

**答案**：

LangGraph 的 interrupt() 是 HITL 的核心机制，它在节点内部暂停图执行，把中间状态（通过 Checkpointer 持久化到 DB）和 interrupt value（需要用户决策的内容）返回给调用方，调用方可以展示给用户并等待；用户决策后通过 `Command(resume=...)` 恢复执行，图从 interrupt 点继续。三种模式中"审批"最简单，只需 approve/reject；"编辑"让用户直接修改中间产物（如日报草稿）然后继续；"澄清"让 Agent 主动提问解决歧义，类似多轮对话但嵌入在 graph 流程里。关键工程细节是 thread_id 管理——每个用户会话有唯一 thread_id，所有 checkpoint 都用这个 ID 存取，服务端无状态，任意实例都能恢复任意 session。

**考察点**：

1. interrupt() 和 checkpointer 的配合（状态如何持久化）
2. stream_mode 下的 interrupt 处理
3. 多 interrupt 节点的图设计（串行审批流）

---

### Q: 什么是 AI Agent 的"幻觉检测"？有哪些主动检测和被动防御手段？

**🏢 高频公司**：MiniMax、字节、阿里

**答案**：

幻觉检测分事前和事后。事前防御：RAG 系统里 system prompt 明确限制"只基于以下文档回答，无法回答时明确说不知道"，Temperature 设为 0 减少随机创造；要求回答时标注来源段落编号，方便后续验证。事后检测：将模型回答拆解为原子声明，用 NLI 模型或 LLM 逐条验证是否能从 context 推断（RAGAS Faithfulness）；也可以用 Self-Check——生成答案后让同一模型（或更强的模型）审查"哪些内容无法从提供的文档中确认"。生产监控上，抽样 5% 的请求做 faithfulness 检测，低分对话进入人工复查队列。发现幻觉集中在某类问题（如数字、日期类）后，可以针对性加强那类问题的 RAG 检索或在 prompt 里加特别提醒。

**考察点**：

1. 引用幻觉的检测（Citation Grounding）
2. 知识幻觉 vs 引用幻觉的不同处理策略
3. 幻觉率的监控指标设计

---

### Q: Agent Memory 的 Write-Back 策略和记忆遗忘机制如何设计？

**🏢 高频公司**：小红书、字节

**答案**：

记忆写入最好异步，不阻塞主响应路径。实现上用 `asyncio.create_task` 启动后台任务，或者发 Kafka 消息让专门的记忆服务处理。提取什么记忆是关键：不是所有对话都值得记录，只提取"用户偏好"、"重要事实"、"决策结果"类信息，普通闲聊不存。记忆的生命周期管理：重要信息（用户的忌口、工作单位）设较长 TTL 或永久；普通偏好（"上次喜欢的餐厅"）设 30 天 TTL。记忆去重很关键，不能无限追加——用 embedding 相似度判断新记忆是否与已有记忆重复，重复则更新而非追加，避免记忆库无限膨胀。在 Critter 项目里我实现了这套机制：按类别（饮食/工作/爱好）分类存储，同类新信息覆盖旧信息，用 json 文件持久化，每次对话注入 system prompt。

**考察点**：

1. 异步写入的可靠性保证（消息队列 vs fire-and-forget）
2. 记忆去重（向量相似度判断是否是同类信息）
3. 记忆隐私和合规（敏感信息不应存入长期记忆）

---

### Q: 如何设计多 Agent 系统的错误恢复和任务重试机制？

**🏢 高频公司**：字节、腾讯

**答案**：

多 Agent 系统的错误恢复分三层。工具级：用 tenacity 的指数退避重试，只重试幂等操作（查询类），写操作必须先加幂等 ID 再重试。任务级：LangGraph Checkpointer 在每个节点执行后保存完整 state，失败时从最后成功节点恢复，不需要从头重跑。服务级：对外部工具调用加 Circuit Breaker，连续失败超阈值时熔断（短路），避免雪崩，定时探测恢复。设计原则是"让 Agent 感知错误并自主决策降级"：工具超时时，Agent 应该在下一个 Thought 里感知到（通过 tool_result 里的错误信息），自主选择备用方案或告知用户"该功能暂时不可用"，而不是对用户完全无响应。

**考察点**：

1. 幂等性对重试的重要性（重试前必须保证操作幂等）
2. Circuit Breaker 三态（Closed/Open/Half-Open）
3. LangGraph Checkpointer 的断点恢复机制

---

### Q: 如何设计 LLM 应用的多租户隔离（Multi-tenant）架构？

**🏢 高频公司**：阿里、腾讯

**答案**：

多租户 LLM 架构的核心是数据和配置的严格隔离。向量数据库上，小租户用共享 Collection + metadata filter（省钱），大租户或安全要求高的给独立 Collection（强隔离）。System prompt 从数据库动态加载，每个租户有独立配置（bot 名字、人格、公司信息），热更新不需要重启服务。限流按 tenant_id 维度用 Redis 令牌桶，防止单个租户打垮整个服务。成本归因必须在 LLM 调用层记录，写入 ClickHouse，支持按租户、按日期、按模型多维度分析。最重要的安全原则：不同租户的对话上下文绝对不能混入，每次请求只携带当前租户的 system prompt 和知识库内容，禁止跨租户的任何信息传递。

**考察点**：

1. Collection 隔离 vs 共享 Collection + filter（成本 vs 严格隔离）
2. 配置的热更新（不重启服务修改租户配置）
3. 跨租户数据泄露的防御（注意 LLM 上下文污染）

---

### Q: 什么是 Agent 的"计划-执行"模式（Plan-and-Execute）？与 ReAct 有何区别？

**🏢 高频公司**：字节、MiniMax

**答案**：

ReAct 每步都做即时决策，灵活但效率有限（每步都要 LLM 推理）；Plan-and-Execute 先花一次 LLM 调用生成完整计划，后续执行 Agent 按计划跑，对于长任务总体 LLM 调用次数更少，且计划可以识别并行步骤。实践中，对于"帮我研究一个主题并写报告"这类需要 10-20 个子任务的复杂请求，Plan-and-Execute 效果更好；对于"帮我查一下天气然后推荐穿衣"这类简单 2-3 步任务，ReAct 更合适（不需要规划开销）。重规划（Replan）是 Plan-and-Execute 的关键补丁：当执行结果与预期偏差较大时，触发 replanner 重新生成后续计划，保证最终目标还能完成。在 LangGraph 里，条件边判断"计划是否完成"和"是否需要重规划"，实现自适应的计划执行。

**考察点**：

1. 何时应该重规划（Replan）
2. Plan 的粒度设计（太细则限制了执行 Agent 的自由度）
3. LangGraph 实现 Plan-and-Execute 的图结构

---
