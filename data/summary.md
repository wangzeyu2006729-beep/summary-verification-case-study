# 10 个数据集 × 10 条：case study 总结

2026-10-08。D 是来源文本，S 是待核验摘要，token 统一用 cl100k_base。

## 0. 这份总结怎么读

- 样本分两步选出。先用 `select_cases.py` 做覆盖式选样，每个数据集 20 条，按原生标注状态、D/S 长度四分位、子集、生成器和错误类型轮流挑选；再用 `select_10.py` 从这 20 条里保留细读过、有人工观察的样本，按标注状态平衡、错误类型和生成器覆盖补足到 10 条。因为优先保留了细读过的样本，有问题的样本偏多；这 10 条里的正负比例、错误类型比例都**不代表整个数据集**。
- 每个数据集我先看了原来 20 条的 S 和原生标注，再挑 3–5 条去 D 里查证据，这些样本都保留在 10 条里。文中引用 D 的内容是我核对过的，判断和推测部分会写明“我的理解”。官方标签一律原样引用。
- case 编号（例如 `TofuEval:10`）可以直接在阅读页面里找到：选数据集，再点对应序号。编号按 10 条重新排过（01–10，按 D/S 长度），和早先 20 条版本不同，新旧对照见 `selected_10.json`。
- 第 1 节是速览，第 2 节逐个数据集写，第 3 节写跨数据集的共同现象，第 4 节汇总已发现的数据问题（数据不做清洗，原样保留，目的就是看清这些问题），第 5 节是还没回答的问题。

## 1. 速览

| 数据集 | 这 10 条长什么样 | 标注上最该注意的地方 | 核验时要做的事 |
|---|---|---|---|
| AggreFact | 新闻，D 161–867，S 18–115；10 个旧式生成器 | 只有整篇 0/1，没有错误位置和理由 | XSum 子集常需要 D 之外的信息；CNN/DM 子集多为近抽取 |
| RAGTruth-Summary | 新闻，S 90–262（中位 158.5），6 个 LLM | span 很短，严格度不一；有 `implicit_true` 标记 | 无错摘要也要逐条核对 5–10 个命题；2/10 带“Sure! Here is…”开场白 |
| UniSumEval | 8 个来源，D 84–6,173，S 23–2,830 | 句级 0/1，宽严不一；句子切分有错 | 句数 2–91 条，工作量差两个数量级 |
| TofuEval | 会议/访谈转写，D 779–1,216；带主题 query | 解释最详细；错误多为时态、归属、观点当事实 | 证据常在转写末尾；要跟踪说话人和事情是否已发生 |
| DiaSumFact | 短聊天和会议片段，D 61–636 | 一句可有多个错误类；多数只给 span 不给理由 | 主要难在“谁说的、谁做的” |
| LongEval | 医学论文、小说，D 2,136–13,444 | 单元是子句碎片；每单元 1–3 个众包票，无汇总 gold | 4/10 条是人工参考摘要，同样会被判不支持 |
| DiverseSumm | 每组 10 篇新闻，D 4,669–11,281 | 官方数据 138/377 条首句与末句重复 | 跨多篇对照；10 篇里常有整篇重复的通稿 |
| ExtEval | 抽取式，D 231–759 | 句子都抄自 D，问题出在上下文丢失 | 逐句蕴含会全部判“支持”，要整体读 |
| SummEval | CNN/DM，旧系统 M0–M23 | 1–5 分量表；众包分与专家分经常相反 | 分数混入流畅度，不能直接二值化 |
| VeriGray | 新闻、维基短文，8 个 LLM | 7 细类，大小写不统一；部分判断用了外部知识 | 灰区要判断确定性和歧义；`out-dependent` 需外部检索 |

## 2. 逐个数据集

### 2.1 AggreFact

**样本概况。** 10 条覆盖 8 个子集（XSumFaith、FRANK 的 CNN/DM 和 XSum 部分、Polytope、Cao22、Wang20、FactCC、SummEval），10 个生成器（1 条未注明），从 PtGen、BertSum、TextRank 到 BART。标注只有整篇一个 0/1，没有错误位置，也没有理由。

**细读的 case。**

- `AggreFact:01`（XSumFaith，BERTS2S），标为有错。S：“England batsman Jos Buttler has signed a new two-year contract with Lancashire.” D 里能找到“new deal ties him to the club until 2019”，“Red Rose”是 Lancashire 的别称，但 D 没写“two-year”。XSum 的 D 删掉了原文第一句（那一句被当作参考摘要），所以模型容易写出只在被删首句里出现、现实中也可能为真的信息。这类错误靠 D 无法证实，但未必是瞎编。
- `AggreFact:04`（Cao22，BART），标为有错。S 说 Bayern 把领先优势扩大到 5 分，并且离第四个连冠只差 3 分。D 写的是“Dortmund, in second, can cut the gap to five points with a win”，也就是说现在领先 8 分；D 还说 Bayern 在最后 5 轮“need a maximum of 11 points”。要发现这个错误，得先从 D 推出当前分差，属于数值推理。
- `AggreFact:07`（FRANK，PtGen），标为支持。三句话几乎逐字来自 D 的前几句。这一类核验很便宜，字面匹配就够。
- `AggreFact:09`（FRANK，Seq2Seq），标为有错。S 里有 `UNK`、整段重复和“california state university, georgia”这样的拼接错误，属于旧模型的退化输出。
- `AggreFact:05`（BertSum）把网页模板“click here for all the latest arsenal news”抽进了摘要，被标为有错。

**要注意的地方。** `AggreFact:03` 和 `SummEval:03` 是同一篇 D（爱荷华脊椎按摩师）。AggreFact 本身就收了 SummEval、FRANK 等数据集再统一二值化，和本批的 SummEval 有重叠。

**和核验工作量的关系。** D 短，S 短，但 XSum 和 CNN/DM 是两种形态：XSum 是一句高度改写的摘要，常常需要 D 之外的信息；CNN/DM 多是近抽取的多句摘要。只有整篇标签，所以输出句级判断的 verifier 必须再聚合成一个结论才能比对。

### 2.2 RAGTruth-Summary

**样本概况。** 10 条来自 CNN/DM 和 Recent News 两个子集，6 个 LLM（GPT-4、GPT-3.5、Llama-2 7B/13B/70B、Mistral-7B）。S 的中位数是 158.5 token，是 AggreFact 的两倍多。5 条有错误 span 的摘要，每条有 2–5 个 span。

**细读的 case。**

- `RAGTruth-Summary:09`（Llama-2-70B，雅兹迪难民）：一条摘要有 5 个 span，包括 3 处 Evident Conflict。“被迫做清洁工”，D 里是“选择放羊”；“被看守性骚扰”，D 里是“被放过”；“丈夫被带到别处”，D 里丈夫当时在外办事，并没有被抓。这类长 LLM 摘要的错误又密又分散。
- `RAGTruth-Summary:01`（Llama-2-7B，五胞胎）：“Both families kept their pregnancies a secret”被标为 Evident Conflict。D 里只有 Rademacher 一家保密，这条标注我认为成立。另一个 span “IVF treatment”标为 Subtle Conflict，D 写的是 intrauterine insemination（人工授精，不是试管）。标注员备注却写“Different procedure but same goal. Does not change any factual details.”。标签和备注的意见并不一致。
- `RAGTruth-Summary:03`（Llama-2-70B，Cruz 法案）：把 `"Schools Not Shelters Act"` 写成少了 “The” 的形式，也被标为 Subtle Conflict，非常严格。同一条里，“Some Democrats have expressed support for the bill…”整句被标为 Evident Baseless Info。可 D 里写着众议院版本“passed along with the support of four Democrats”，所以前半句并非完全没有依据，后半句“others argue it goes against American values”确实是编的。我的理解：span 圈得比实际出错的部分大，算不算错可以争论。
- `RAGTruth-Summary:04`（GPT-3.5，施瓦辛格），无错。D 本身读起来像二次改写的稿件，有“serves as an inspiration to many”这样的评价句，S 原样保留了这种评价。Recent News 子集的 D 文风值得留意，我没有进一步核实 D 的来源。

**要注意的地方。**

- `implicit_true=true` 标记的是 D 里没有、但现实中为真的内容，例如 `:06` 的“now known as Caitlyn”和 `:10` 的“14th Amendment”。它们和 FaithBench 的 benign、VeriGray 的 out-dependent 是同一类现象。算不算错，取决于 benchmark 的口径。
- 2/10 条（`:01`、`:07`）以 “Sure! Here is a summary of the news in 77 words:” 这类开场白开头。它们计入 S 的 token，但从来不会被标为错误。

**和核验工作量的关系。** D 中等长（396–1,548），但 S 的命题多。标为“无错误 span”的摘要有 91–165 token，要确认它没错，得把每个命题都核一遍；找到一处错就能下结论的摘要反而可能更省事。span 级标签还可以用来评估定位能力，不只看整篇对错。

### 2.3 UniSumEval

**样本概况。** 这 10 条覆盖 wikihow、dialogsum、MultiWOZ、MeetingBank、CNNDM、mediasum、PubMed、GovReport 八个来源。D 84–6,173，S 23–2,830，每条 2–91 个句子，S 的长度跨度是 10 个数据集里最大的。

**细读的 case。**

- `UniSumEval:09`（Mixtral，PubMed）：S 2,830 token，91 句，几乎把 5,815 token 的 D 改写了一遍，其中 2 句被标为错误。句子切分把“(ex.”和“pregnancy, lactation).”切成了两个单元，两个都被标为正确。逐句核验的话，这一条就要 91 次。
- `UniSumEval:07`（phi-2，PubMed）：“armodafinil had a slightly higher responder rate”被标为 SenE。D 写的是 armodafinil 72.12%、modafinil 74.29%，结论刚好相反，要比较数字才能看出来。最后一句“The text is written in a clear and concise manner”是对文章的评价，被标为 OutE。
- `UniSumEval:04`（Llama-2-13B，MeetingBank）：摘要变成了“Speaker 11 says the recording is good”之类的流水账，16 句里 13 句被判错。会议的程序性闲聊会让模型输出退化。
- `UniSumEval:02`（BART，DialogSum）：“Person2 can't send an e-mail because of a virus”。D 里 Person2 只是猜测有病毒，Person1 随即说“it has nothing to do with virus”，所以这句标错是对的。“Person1 will look at Person2's computer”也被标为 RelE，但 D 里 Person1 确实问了能不能看一下，对方同意了。这里的判断偏严，可能针对的是时态。
- `UniSumEval:10`（Llama-2-13B，GovReport），标为全对。其中一句说 2019 年把 EELV 改名为“National Security Space program”。D 写的是“NDAA for FY2019, Congress renamed the EELV to the NSSL program”，摘要漏了 Launch，还把财年当成了年份，标注没有追究。这里又偏宽松。另外这篇 D 里有 `â` 之类的编码乱码。
- `UniSumEval:05` 和 `:06` 是同一篇 D：BART 有 2 句错（“Eddie Howe's side remain top”“Ipswich…sit second”），Claude 2.1 全对。很适合用来对比生成器。

**和核验工作量的关系。** 同一数据集里，有的条目的成本主要来自 D 长（GovReport 约 6k），有的来自 S 句数多（`:09` 的 91 句）。按 D 长度分桶来估成本是不够的，S 的命题数也要算进去。

### 2.4 TofuEval

**样本概况。** MeetingBank 和 MediaSum 的转写，每条都有一个主题 query，要求按主题写摘要。生成器匿名（model_A–E 和 Model-Extra）。D 的长度集中在 779–1,216，S 38–106。每个错误句都有标注员的文字解释，是这 10 个数据集里解释最详细的。

**细读的 case。**

- `TofuEval:10` 和 `:09` 是同一篇 D（长滩市议会审议娱乐许可）。model_A 说“The council will vote”，被标为 Tense/Modality Error，解释是“They have voted after the hearing”。D 的末尾确实有“please cast your vote. Speaker 0: Motion case.”（语音识别把 motion carries 识别成了 Motion case），证据在转写最后。model_A 还说“There have been no public comments”，被标为 Contradiction，因为店主 Andy Carter 在公众发言环节讲了话。第三处是商号：D 写的是“Toshiko LLC. Doing business as the good bar and eatery”，摘要写成“A business named The Good Barn Eatery”。D 是语音转写，店主自报家门时说的就是“Good Barn Eatery”，转写噪声和真实错误混在了一起。model_D 写“the council voted to approve it”，被标为支持。
- `TofuEval:08`：query 是“Bush vs. Clinton Comparisons”，摘要写的却是 D 里另一段关于加州高中毕业考试的新闻；Bush 和 Clinton 在 D 里只出现在节目预告里。三句都被标错，理由都是事实层面的，没有一条说“跑题了”。忠实性标签不管摘要有没有回答 query。
- `TofuEval:04`：“Councilmember Desai entered into the record the names…”被标为 Tense/Modality Error，理由是 D 里只说他“想要”登记，不清楚是否真的登记了。“想做”和“做了”的区别被当成事实错误。
- `TofuEval:07`：模型写出“The summary does not mention Rudy Giuliani, but…”，把自己正在写摘要这件事说进了摘要里，被标为 Contradiction。

**和核验工作量的关系。** D 长度集中，难点不在长度，而在于跟踪说话人、事件状态（已投票还是将投票）和观点归属（是谁的说法）。这些证据经常分散在整篇转写里，只看局部窗口不够。

### 2.5 DiaSumFact

**样本概况。** SAMSum 聊天（D 61–216）和 QMSum 会议片段（D 159–636，带问题式 query）。生成器有 BART、PEGASUS、S-BART、CONDIGSUM、DialogLM、微调 GPT-3。

**细读的 case。**

- `DiaSumFact:06`（微调 GPT-3）：同一个两人对话里有三类错误。说话人搞反了（EntE：Autumn 应为 Israel），谓词反了（hasn't sewn 应为 has sewn），因果编出来了（LinkE：because she was focusing on the tests）。
- `DiaSumFact:10`（PEGASUS，QMSum）：query 是“Why did the group decide to incorporate a menu display…”，摘要照抄成“the group decided to incorporate a menu display…”，被标为 No Error。D 里只有 marketing 说“I wonder if incorporating that … might be useful”，其他人附和“Yeah”，算不算“决定”是可以讨论的。query 里预设的事实被直接搬进了摘要，标注把它当成已知。而且摘要没有回答“为什么”。
- `DiaSumFact:07`（S-BART），标为无错，判断我认同。值得注意的是 D 本身有噪声：开头“Ditty: Hello Ditty”和“Inga: Thanks. We are fine.”看起来是说话人标签贴错了。
- QMSum 上的 DialogLM 摘要（`:04`、`:05`、`:08`、`:09`）几乎每句都有错，一句常有 2–4 个错误类。解释大多只有 span 和 intrinsic/extrinsic 标记，比如“the inside: (intrinsic)”，没有文字理由。

**和核验工作量的关系。** D 最短，单条成本低。主要难点是指代和说话人对齐。同一句允许多个错误类，所以“有 6 种错误”不能理解成六选一的分类。

### 2.6 LongEval

**样本概况。** PubMed（pubmed 和 pubmed_block）和 1 条 SQuALITY 小说。生成器有 BigBird-PEGASUS、LongT5、BART+DPR，还有人工参考。D 2,136–13,444。标注单元是从摘要里切出的子句，每个单元有 1–3 个众包标注员投 Yes/No，没有汇总后的 gold。

**细读的 case。**

- `LongEval:03`（人工参考，pubmed_block）：背景句“severe fever with thrombocytopenia syndrome bunyavirus is a newly discovered bunyavirus with high pathogenicity”3 票全是 No。我查了 D：pubmed_block 给的 D 从“descriptive investigation of a cluster…”开始，是论文中间的一段，没有引言，所以论文摘要里写的背景在这段 D 里找不到。人工参考摘要对“给定的 D”也不一定忠实。
- `LongEval:10`（BigBird-PEGASUS）：编出了“human gpcr1, human gpcr2 … gpcr6”这样的列表，3 票全 No。
- `LongEval:07`（BART+DPR，SQuALITY）：36 个单元里 33 个有 No 票，小说情节几乎都是编的。
- 单元经常不是完整命题，例如 `:05` 的“p <unk> 0.001, and”，`:04` 的“all patients were subjected to cranial”，`:08` 的一长串“. . . .”。碎片本身没法核验，有的标注员投 No，有的投 Yes。
- 标注员分歧很常见。`:02` 的三个单元分别是 No/Yes/Yes、No/No/Yes、No/Yes/No。

**要注意的地方。**

- 10 条里有 4 条生成器名是 `*_human`（`:01`、`:03`、`:06`、`:09`）。选样脚本只按 gold/human/reference 的精确名称排除，没有排除 LongEval 的人工参考；全量 120 条里有 40 条是人工参考。保留它们对 case study 有用（`:03` 就是好例子），阅读时要记得它们是人写的。
- LongT5 的输出带 `<pad>`、`<unk>`（`:05`）。D 里普遍有 `<br />` 残留。

**和核验工作量的关系。** D 长，单元 3–36 个。单元碎片化会让逐单元核验的成本和含义都变得不稳定：一个碎片既可能因为“无法核验”被判 No，也可能因为“没有错”被判 Yes。

### 2.7 DiverseSumm-LongFormFact

**样本概况。** 每组 10 篇新闻，D 4,669–11,281，生成器是 GPT-4、GPT-3.5-Turbo-16K、LongChat-7B、Vicuna-7B。句级标签：1 支持，0 不支持。

**细读的 case。**

- 被标为不支持的句子，很多是生成故障，不是细微的事实错误。`:05` 的整个 S 只有“The summary is structured format.”；`:07` 把提示词模板“```summary: [your summary]`…”原样吐了出来；`:06` 有一个只剩“The”的句子；`:09` 在“Article 2: * Windows at India's High Commission in”处截断；`:10` 陷入“the Dow Jones Industrial Average dropping 384. points”的重复循环。
- 真正的内容错误：`:02`（Vicuna）说 Moderna 把价格“from $9.60 to $130”。10 篇里都说计划定价约 130 美元、“quadruple the price”，但没有任何一篇出现 9.60 美元。`:08`（GPT-3.5）10 句里有 4 句不支持，多是“This suggests that investors may be awakening…”这类引申解读。
- GPT-4 的摘要大量使用“Article 3 and 5 stress…”这种按篇归属的写法。我用 `:04` 核对过：“Article 3 … twice in the year 2030”对应 `sources[3]`，“Article 8 … 13 hours”对应 `sources[8]`，也就是说编号从 0 开始。阅读页面已改为显示“Article 0（第 1 篇）”。

**数据问题（官方发布的数据就有）。** 377 条里有 138 条的 `summary_sentence[0]` 与最后一句完全相同，其中 GPT-4 占 96/100。表现是摘要以结论句开头。例如 `:01` 以“In contrast, several articles…”开头，`:04` 第一句和最后一句一字不差。看起来原本的第一句被最后一句覆盖了，真实首句已经丢失。我在服务器的 `data/repos/meetdavidwan__longformfact/data/metric_benchmark/diversesumm.jsonl` 里确认，这个问题在官方文件里就存在，不是我们转换时引入的。另外 `:08` 把“2.”“3.”“4.”这样的列表序号也当成了句子。

**重复文档。** 这 10 条来自 9 组文章，其中 7 组至少有一对近似重复的文章（8-gram 重合 ≥ 0.5）。`:02`/`:03` 那组有 5 篇完全相同的通稿，`:09` 那组有 7 篇。所以全量“D 中位 7,707 token”高估了真正需要阅读的内容。遇到“Article 4 says …”这种说法时，如果 4、5、7、8 是同一篇稿子，归属对不对也说不清。

**和核验工作量的关系。** D 最长，但冗余也最多。一条 claim 常常要对照多篇文章（“Articles 0, 1, 4, 5 announce…”）。生成故障用很便宜的规则就能识别；它们是否应算作“不忠实”样本，是 benchmark 口径要决定的问题。

### 2.8 ExtEval

**样本概况。** 10 个抽取式系统和设置（BanditSum、MatchSum、PacSum、HiStruct、Oracle-Disco 等）。S 的每个句子或子句都直接来自 D。每条标 6 个字段，包括两个标注员各自给的 misleading。位置写成 `s3-he` 的形式，意思是摘要第 3 句里的“he”。

**细读的 case。**

- `ExtEval:06`、`:07`、`:08` 是同一篇 D（牛排大胃王比赛），三个系统的摘要都被两位标注员判为 misleading。“on one side were hulking football players…”和“the contest … wasn't even close”放在一起，读者会以为橄榄球员赢了。D 后文写的是 124 磅的职业大胃王 Schuyler 打败了包括橄榄球员在内的四支队伍。每一句单独看都是真的。
- `ExtEval:01`（mi_unsup）：抽出来的“'' he said monday”里的 he，在 D 里指警察局长，放进摘要后像是指 CNN 附属台；句子顺序还让读者以为母亲是在儿子转身之后才打他，实际顺序相反。
- `ExtEval:03`（oracle_disco）：抽出的是子句级片段，“and recently told a congressional commission…”没有主语，“she supports the probe and prompted…”把两个不相干的片段接在了一起。
- `ExtEval:10`（MatchSum）六个字段都是 no，但结尾有半个引号，“the death came about”也没说清是谁的死（D 里指长颈鹿）。标注偏宽松。

**和核验工作量的关系。** 逐句做蕴含判断会把所有句子都判成“支持”。问题只有在把摘要当作一个整体来读、并把代词和连接词对回 D 时才会暴露出来。D 短，但需要的是全局阅读，不是逐句查找。

### 2.9 SummEval

**样本概况。** CNN/DM，10 个旧系统（编号在 M2–M23 之间），D 230–604。每条有 3 个专家和 5 个众包的 consistency 1–5 分。

**细读的 case。**

- `SummEval:06`（M14）：“arsene wenger does not know if sanchez decided to join the north london club”。D 写的是 Wenger “is delighted that Sanchez decided to join”，以及“I don't know why he did that”。模型把“不知道为什么”改成了“不知道是否”。专家打 [2, 1, 1]，众包打 [5, 5, 5, 5, 5]。
- `SummEval:09`（M23）：大部分照抄，但把 D 的“was found dead at the end of the disused Northern Promenade”改成了“fell down the cliff at the end of…”，还抄进了 Samaritans 求助热线的模板句。专家打 [2, 2, 2]，众包打 4 分。
- `SummEval:05`（M11）：句子支离破碎，比如“sterling says he is the former female companion who has lost the .”。专家全打 1 分。分数里混进了流畅度。

**要注意的地方。** 众包分经常是一个常数：`:05`、`:08` 是 5 个 3，`:09` 是 5 个 4，`:06`、`:07` 是 5 个 5，和专家意见对不上。专家之间也有分歧：`:08` [5, 3, 5]，`:04` [3, 1, 3]，`:07` [3, 1, 2]。`SummEval:06` 和 `:08` 是同一篇 D，M14 低分，M12 得 4.33 分。

**和核验工作量的关系。** 单条成本低。难点在于标签是有序评分，不是错误位置，4 分不等于“80% 正确”。用它评 verifier 需要先定好阈值或排序口径。

### 2.10 VeriGray

**样本概况。** D 是 FaithBench 的新闻和维基短文（287–992），生成器有 8 个，包括 GPT-4o、DeepSeek-V3、Qwen3-8B、Claude 3.5 Sonnet。每条 3–10 句，每句一个细类标签，`note` 里用 `|` 分隔多位标注员的意见。

**细读的 case。**

- 灰区举例。`:03`：“moved … due to public opposition in 2007”，2007 修饰的是搬迁还是反对，有歧义，标为 ambiguous。`:02`：D 没说击落飞机的 F-16 属于土耳其，要靠维基百科才能确认，标为 out-dependent。`:06`：D 写“several hours”，S 写成“two-hour standoff”，标为 fabricated；D 写“from a number of bases”，S 写成“from bases in the east”，被认为说过头了。
- 用外部知识判矛盾：`:08` 的“Brexit negotiations, which were expected to begin in 2018”被标为 contradicting，理由是“Formal Brexit negotiations started in 2017”，这条依据来自 D 之外。
- 截断：`:06` 最后一句“President Ash”被标为 No-Fact。`:10` 在“$220”处截断（D 写的是 220 billion），被标为 implicitly-supported，但 note 里写着“this caused a clear hallucination”。标签和备注不一致。
- `:05`（Qwen2.5-7B）前一句说 Flynn “scored twice”，后一句又说“Flynn's hat-trick”，摘要自相矛盾。

**要注意的地方。**

- 标签大小写不统一，例如 `Explicitly-Supported` 和 `explicitly-supported`、`No-Fact` 和 `no-fact` 同时出现，需要先统一。
- 开场白“Here is a concise summary of the passage:”会和第一句合成一个标注单元（如 `:01`）。Markdown 列表序号（“1.”）也会被切进句子里（`:09`）。
- 有 2 条记录（`:06`、`:08`，共 15 句）的 `range` 字段和 S 的字符位置对不上，但 `text` 字段是对的；阅读页面用的是 `text`。
- `:07`/`:08` 是同一篇 D、不同生成器的样本。

**和核验工作量的关系。** D 短，但灰区判断要看确定性和修饰范围，out-dependent 还要外部知识。只给 D 的 verifier 在这些句子上的“错误”，有一部分其实是任务定义问题，不是能力问题。

## 3. 跨数据集的共同现象

### 3.1 生成故障和事实错误混在一起

很多被标为“错”的样本，其实是输出退化：开场白、截断、重复循环、吐出模板、`<pad>`/`<unk>`、整句碎片。最集中的是 DiverseSumm（`:05`、`:06`、`:07`、`:09`、`:10`），LongEval、VeriGray、UniSumEval `:04`、AggreFact `:09` 里也有。各数据集对它们的处理并不相同：VeriGray 把截断句标为 No-Fact，DiverseSumm 标为不支持，RAGTruth 从不标开场白。

这对效率比较可能有影响：这些样本用规则就能识别，几乎不花成本。如果它们在某个数据集里占比高，“便宜方法也能拿高分”的现象就可能部分来自这里。是否把它们单独分出来，可以等全量统计之后再决定。

### 3.2 标注严格度不一致

同一种偏差，在不同数据集里得到不同的判定：

- 偏严：RAGTruth `:03` 少了一个“The”就算 Subtle Conflict；TofuEval `:04` 把“想登记”写成“登记了”判为时态错误；UniSumEval `:02` 也偏严。
- 偏宽：UniSumEval `:10` 的改名表述、ExtEval `:10` 的残句都被放过。
- 用外部知识：VeriGray `:08` 依据 D 之外的事实判矛盾；RAGTruth 的 `implicit_true`、VeriGray 的 out-dependent 处理的是同一类“D 里没有但现实为真”的内容。

把不同数据集合到一起做统一实验时，口径怎么对齐还是个开放问题。

### 3.3 D 不一定是完整的依据

- XSum 删掉了首句（AggreFact `:01`）。
- LongEval 的 pubmed_block 只给了论文中间一段，人工参考摘要也会因此被判不支持（`:03`）。
- TofuEval、DiaSumFact 的 query 本身含有预设（DiaSumFact `:10`），标注会把 query 当成已知。
- 语音转写和聊天记录里有说话人标签错误、识别错误（TofuEval `:10`、DiaSumFact `:07`）。

### 3.4 同一篇 D 配多个 S

本批有 9 组共享 D 的样本：`AggreFact:03`/`SummEval:03`（跨数据集），`UniSumEval:05`/`:06`，`TofuEval:03`/`:04`、`:09`/`:10`，`LongEval:02`/`:03`，`DiverseSumm:02`/`:03`，`ExtEval:06`/`:07`/`:08`，`SummEval:06`/`:08`，`VeriGray:07`/`:08`。它们可以直接用来对比生成器：同一份证据，不同的错误模式。对效率问题来说，D 能不能编码一次、多个 S 复用，也和这种结构有关。

### 3.5 多文档冗余

本批 DiverseSumm 的 9 组文章里有 7 组含近似重复文章，有的一组里有 5–7 篇相同的通稿。实际的独立内容比 token 数显示的少。

### 3.6 标注员分歧

LongEval 的 2:1 投票、SummEval 众包分与专家分相反、ExtEval 两位标注员的 misleading 判断不一致、VeriGray note 里的多种意见，都说明这些 gold 本身有不确定性。拿 verifier 和 gold 比时，不确定性大的样本可能需要单独看。

### 3.7 证明“没错”的成本

无错的摘要要把每个命题都核一遍才能下结论；有错的摘要找到第一处错就可以停。RAGTruth 的无错摘要有 91–165 token，UniSumEval `:09` 有 91 句全要核。这种不对称在算平均成本时会被抹平，按标签分开统计可能更清楚。

## 4. 已发现的数据问题

| 数据集 | 问题 | 规模 | 来源 |
|---|---|---|---|
| DiverseSumm | `summary_sentence[0]` 与最后一句相同，真实首句丢失 | 138/377（GPT-4 96/100） | 官方发布文件 |
| DiverseSumm | 摘要里的“Article N”从 0 开始编号；列表序号“2.”被切成句子 | 普遍 | 官方 |
| LongEval | 生成器 `*_human` 是人工参考，选样时没排除 | 全量 40/120，本批 4/10 | 选样规则 |
| LongEval | LongT5 输出带 `<pad>`/`<unk>`；D 有 `<br />` | 本批 1/10 有 pad/unk | 官方 |
| VeriGray | 标签大小写不统一；部分 `range` 和 S 对不上 | 大小写 8/10 条；range 2 条记录 15 句 | 官方 |
| RAGTruth、VeriGray | LLM 开场白计入 S，有时和第一句合为一个单元 | 本批 2/10、3/10（含 “**Summary:**” 标题） | 生成 |
| UniSumEval | GovReport D 有编码乱码 `â`；句子切分错误 | 个别 | 官方 |
| AggreFact × SummEval | 同一篇 D 在两个数据集里重复出现 | 本批 1 组 | 数据集构造 |
| SummEval | 众包分常为常数，和专家分相反 | 本批多条 | 官方 |

## 5. 还没回答的问题

这些是读完这批样本后留下的问题，没有排序，也不代表结论：

- 生成故障类样本在各数据集全量里占多少？要不要单独分组，还是保留在“不忠实”里？
- `implicit_true`、benign、out-dependent 这类“D 外为真”的内容，统一口径应该按 D 还是按事实？
- LongEval 的碎片单元和 2:1 投票，是聚合成句级或整篇再用，还是只用一致的单元？
- DiverseSumm 的重复首句是去掉、恢复，还是整条标记出来？去重后 D 的有效长度是多少？
- 同一 D 多个 S 的结构，在成本统计里要不要考虑复用？
- 无错样本和有错样本的核验成本是否要分开报告？

## 6. 阅读页面与复现

- 静态网页在 `site/`：总览页有“数据集 × 自动问题标记”和“数据集 × 人工观察”两张热力表，点格子直接打开对应样本；逐条阅读页左侧筛选，中间是原文，右侧是数据问题、摘要高亮、原生标注、笔记和本数据集总结，三栏各自滚动，窄屏改为整页滚动。
- 数据不做清洗：D、S 和官方标注原样展示。自动标记由 `site/build_site.py` 按固定规则生成，只是阅读提示；人工观察在 `site/manual_notes.json`，来自本总结细读过的 case。
- 复现：`python3 select_10.py`（从 `../case_study_200_20261008/selected_bundle.json` 的 20 条里选 10 条），再 `python3 site/build_site.py`。本地打开：

```bash
python3 -m http.server 8766 --directory site
```

- 笔记存在浏览器 localStorage 里，可以导出、导入。
