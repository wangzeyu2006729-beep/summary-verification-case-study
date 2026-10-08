# 摘要核验 Case Study

10 个摘要事实性（faithfulness）数据集各 10 条样本的阅读页面：原文 D、摘要 S、官方原生标注，以及数据集本身的问题。

- **数据不做清洗**：D、S 和标注都按各数据集的发布版本原样展示。
- **自动问题标记**：用固定规则检测，例如开场白、截断、重复、首句等于末句、人工参考摘要、同一 D 多个 S、多文档重复、原文残留、标注员分歧。这些标记只是阅读提示，不是更正。
- **人工观察**：来自 case study 总结里细读过的样本，见 `data/summary.md`。
- **选样**：每个数据集先按标注状态、长度、子集、生成器和错误类型覆盖式选 20 条，再保留细读过的样本、按标注状态平衡补足到 10 条。因为优先保留了细读过的样本，有问题的样本偏多，比例不代表整个数据集。

本地打开：`python3 -m http.server 8000`，然后访问 `http://localhost:8000`。

样本内容版权和许可归各原始数据集所有（AggreFact、RAGTruth、UniSumEval、TofuEval、DiaSumFact、LongEval、LongFormFact/DiverseSumm、ExtEval、SummEval、VeriGray），使用时请遵守各自的许可。
