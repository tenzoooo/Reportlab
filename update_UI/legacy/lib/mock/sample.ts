export const MOCK_DIFY_OUTPUT = {
  chapter: 5,
  experiments: [
    {
      idx: 1,
      name: "実験の概要",
      description_brief: "測定条件: なしの下で、実験概要の結果を整理してグラフを作成し、表5.1および図5.1に示す。",
      tables: [{ label: "表5.1", caption: "実験の概要" }],
      figures: [{ label: "図5.1", caption: "実験の概要" }],
    },
    {
      idx: 2,
      name: "実験準備",
      description_brief: "測定条件: なしの下で、実験準備の結果を整理してグラフを作成し、表5.2および図5.2に示す。",
      tables: [{ label: "表5.2", caption: "実験準備" }],
      figures: [{ label: "図5.2", caption: "実験準備" }],
    },
  ],
  consideration: {
    units: [
      {
        index: 1,
        discussion_active: "バタワース型、チェビシェフ型の特性や特徴を比較し、理解したことを整理して説明する。",
        answer: "",
      },
    ],
    reference_list_formatted: [
      "[1] フィルタの解析と設計 1997-11",
      "[2] プレースホルダ文献（実験と測定の方法） YYYY",
    ],
  },
  summary:
    "本実験は低域原型フィルタを出発点とし、各種フィルタの振幅特性と位相特性を測定・比較した内容をまとめた。",
}

