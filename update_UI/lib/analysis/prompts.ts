export const ANALYSIS_SYSTEM_PROMPT = `
You are an expert assistant that extracts structured data from scientific experiment reports (PDF text) in Japanese.
Your task is to analyze the provided text and output a JSON object that matches the following structure.
Ensure the output is valid JSON. Do not include any markdown formatting (like \`\`\`json).

Structure:
{
  "chapter": number, // The chapter number of the experiment (default to 1)
  "experiments": [
    {
      "idx": number, // Experiment index (1, 2, 3...)
      "subidx": string | null, // Sub-index if any (e.g., "a", "b")
      "name": string, // Name of the experiment (実験名)
      "description_brief": string, // Summary of Experimental Methods (実験方法の要約)
      "tables": [
        {
          "label": string, // e.g., "Table 1.1", "表1.1"
          "caption": string, // Table caption
          "rows": string[][] // 2D array of strings representing table content
        }
      ],
      "figures": [
        {
          "label": string, // e.g., "Figure 1.1", "図1.1"
          "caption": string // Figure caption
        }
      ],
      "quant_comment": string // Quantitative comment or observation
    }
  ],
  "consideration": {
    "units": [
      {
        "index": string, // e.g., "(1)", "1."
        "discussion_active": string, // The specific discussion topic or question (考察課題)
        "answer": string // The answer or discussion content (can be empty if not provided in text)
      }
    ],
    "references": [
      {
        "id": string, // e.g., "1"
        "title": string, // Title of the reference
        "year": string // Year of publication
      }
    ]
  },
  "summary": string // A summary of the entire report
}

Instructions:
1.  **Language**: The input text is in Japanese. Process it accordingly.
2.  **Chapter**: Extract the chapter number. If not found, use 1.
3.  **Experiments**: Identify each experiment described in the text.
    *   **Name**: Extract the experiment name.
    *   **Description**: Extract the "Experimental Methods" (実験方法) section and summarize it briefly into \`description_brief\`.
4.  **Tables & Figures**: Extract tables and figures mentioned.
    *   Look for "表" (Table) and "図" (Figure).
    *   Extract captions and labels.
    *   For tables, try to reconstruct the rows from the text if possible.
5.  **Consideration (考察)**: Extract the "Discussion" or "Consideration" (考察) section.
    *   Identify individual discussion topics or questions (often numbered or labeled as "考察課題").
    *   Map each topic to a unit in \`consideration.units\`.
    *   Set \`discussion_active\` to the topic/question text.
    *   If the text contains answers or analysis for these topics, put them in \`answer\`.
6.  **References**: Extract references (参考文献) into \`consideration.references\`.
7.  **Summary**: Generate a brief summary of the report in Japanese.
8.  **Missing Data**: If a field is missing or cannot be determined, use null or an empty string/array as appropriate.
`

export const METHOD_EXTRACTION_PROMPT = `
あなたは長文テキストから「実験方法」セクションのみを“原文どおり”抽出する厳密抽出器である。要約・言い換え・追記・削除・順序入替は禁止。

対象(A): 実験方法（配下小節や箇条書きを含めて本文としてそのまま）

許可する最小整形（内容不変に限る）:
- ページヘッダ/フッタ・ページ番号・脚注番号の除去
- ハイフンで分断された改行語の結合（例 “フィル-\\nタ”→“フィルタ”）
- 行頭/行末の余分な空白除去
※語句・記号・順序の変更、LaTeX化、記号置換は禁止。

- 小節（例: 4.1, 4.2 …）や箇条書きは本文に含める（別配列は作らない）。

欠損時:
- 見つからない場合、空文字列で返す。

出力は**JSONのみ**。解説やコードフェンス外の文字を付けない。すべての文字列は入力textのサブストリングであること。出現順は原文どおり。
`

export const METHOD_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "method_extraction",
    schema: {
      "$id": "https://example.com/schemas/method_extract.v1.schema.json",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "properties": {
        "method": {
          "additionalProperties": false,
          "properties": {
            "heading": {
              "type": "string"
            },
            "section_number": {
              "type": "string"
            },
            "text": {
              "type": "string"
            }
          },
          "required": [
            "heading",
            "section_number",
            "text"
          ],
          "type": "object"
        }
      },
      "required": [
        "method"
      ],
      "title": "MethodExtractV1",
      "type": "object"
    },
    strict: true
  }
}

export const DISCUSSION_EXTRACTION_PROMPT = `
あなたは長文テキストから「考察、報告事項及び検討事項」系セクションのみを“原文どおり”抽出する厳密抽出器である。要約・言い換え・追記・削除・順序入替は禁止。

対象(B): 考察（箇条書きを含めて本文としてそのまま）

許可する最小整形:
- ページヘッダ/フッタ・ページ番号・脚注番号の除去
- ハイフンで分断された改行語の結合
- 行頭/行末の余分な空白除去
※語句・記号・順序の変更、LaTeX化、記号置換は禁止。

セクション検出:
- 開始見出しパターン例:
  ^\\s*\\d+\\.\\s*考察
  ^\\s*考察$
  ^\\s*検討$
  ^\\s*報告事項$
  ^\\s*Discussion$
  ^\\s*考察課題$

他考察と思われるセッション
考察のセッションは主に実験方法の次のセッションに属することが多い。
- 開始見出し行から、次の同レベル大見出しの直前（または文書末）までを(B)とする。
- 箇条書きは本文に含める（別配列は作らない）。

欠損時:
- 見つからない場合、空文字列で返す。

出力は**JSONのみ**。解説やコードフェンス外の文字を付けない。すべての文字列は入力textのサブストリングであること。出現順は原文どおり。
`

export const DISCUSSION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "discussion_extraction",
    schema: {
      "$id": "https://example.com/schemas/discussion_extract.v1.schema.json",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "properties": {
        "discussion": {
          "additionalProperties": false,
          "properties": {
            "heading": {
              "type": "string"
            },
            "section_number": {
              "type": "string"
            },
            "text": {
              "type": "string"
            }
          },
          "required": [
            "heading",
            "section_number",
            "text"
          ],
          "type": "object"
        }
      },
      "required": [
        "discussion"
      ],
      "title": "DiscussionExtractV1",
      "type": "object"
    },
    strict: true
  }
}

export const EXPERIMENT_STRUCTURE_PROMPT = `
以下の実験方法テキストから、実験の階層構造を抽出してJSON形式で出力してください。

実験方法テキスト:
{{experiment_methods_text}}

抽出ルール:
1. 大項目（4.1, 4.2, 4.3...）→ idx（1, 2, 3...）に変換
2. 小項目（4.1.1, 4.1.2...）→ subidx（1, 2, 3...）に変換
3. 小項目がない大項目の場合 → subidx = null
4. 各項目のタイトルを name として抽出
出力形式:
[
  {
    "section": "4.1",
    "idx": 1,
    "subidx": null,
    "name": "RLC回路"
  },
  {
    "section": "4.1.1",
    "idx": 1,
    "subidx": 1,
    "name": "IC - VCE特性の測定"
  }
]

必ずJSON配列形式で出力してください。他のテキストは含めないでください。`

export const EXPERIMENT_STRUCTURE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "experiments_output",
    schema: {
      "additionalProperties": false,
      "description": "実験項目の出力スキーマ",
      "properties": {
        "chapter": {
          "additionalProperties": false,
          "type": "number"
        },
        "experiments": {
          "additionalProperties": false,
          "description": "実験項目のリスト",
          "items": {
            "additionalProperties": false,
            "properties": {
              "idx": {
                "additionalProperties": false,
                "description": "実験の大項目番号",
                "example": 1,
                "type": "integer"
              },
              "name": {
                "additionalProperties": false,
                "description": "実験項目の名称",
                "example": "IC - VCE特性の測定",
                "type": "string"
              },
              "section": {
                "additionalProperties": false,
                "description": "実験書のセクション番号",
                "example": "4.1.1",
                "type": "string"
              },
              "subidx": {
                "description": "実験の小項目番号（ない場合はnull）",
                "example": 1,
                "type": [
                  "integer",
                  "null"
                ]
              }
            },
            "required": [
              "section",
              "idx",
              "subidx",
              "name"
            ],
            "type": "object"
          },
          "title": "experiments",
          "type": "array"
        }
      },
      "required": [
        "experiments",
        "chapter"
      ],
      "title": "experiments_output",
      "type": "object"
    },
    strict: true
  }
}

export const EXPERIMENT_DETAILS_PROMPT = `
以下の実験方法テキストから、各実験の詳細情報を抽出してJSON形式で出力してください。

実験方法テキスト:
{{experiment_methods_text}}

実験構造:
{{experiment_structure}}

各実験について以下を抽出してください:
1. 測定条件: 変化させるパラメータとその値（例: "IB = 20, 40, 60 μA"）
2. 実験種類: "測定", "計算", "分析" のいずれか
   - 測定: 実際に測定装置を使って測定する実験
   - 計算: Mathematica等で計算する実験
   - 分析: 測定結果を整理・分析する実験
3. 使用ツール: Mathematica等の計算ツールを使用する場合は記載
4. 参照データ: 他の実験や表を参照する場合は記載

出力形式:
[
  {
    "section": "4.1.1",
    "idx": 1,
    "subidx": 1,
    "name": "IC - VCE特性の測定",
    "measurement_conditions": "IB = 20, 40, 60 μA",
    "experiment_type": "測定",
    "tool": null,
    "reference": null
  }
]

必ずJSON配列形式で出力してください。他のテキストは含めないでください。`

export const EXPERIMENT_DETAILS_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "experiments_output",
    schema: {
      "additionalProperties": false,
      "description": "実験項目の出力スキーマ",
      "properties": {
        "experiments": {
          "additionalProperties": false,
          "description": "実験項目のリスト",
          "items": {
            "additionalProperties": false,
            "properties": {
              "experiment_type": {
                "additionalProperties": false,
                "description": "実験の種類",
                "enum": [
                  "測定",
                  "計算",
                  "分析"
                ],
                "type": "string"
              },
              "idx": {
                "additionalProperties": false,
                "description": "実験の大項目番号",
                "example": 1,
                "type": "integer"
              },
              "measurement_conditions": {
                "additionalProperties": false,
                "description": "測定条件（パラメータと値）",
                "example": "IB = 20, 40, 60 μA",
                "type": "string"
              },
              "name": {
                "additionalProperties": false,
                "description": "実験項目の名称",
                "example": "IC - VCE特性の測定",
                "type": "string"
              },
              "reference": {
                "additionalProperties": false,
                "description": "参照する他の実験や表（ある場合）",
                "example": "表5.1",
                "type": [
                  "string",
                  "null"
                ]
              },
              "section": {
                "additionalProperties": false,
                "description": "実験書のセクション番号",
                "example": "4.1.1",
                "type": "string"
              },
              "subidx": {
                "additionalProperties": false,
                "description": "実験の小項目番号（ない場合はnull）",
                "example": 1,
                "type": [
                  "integer",
                  "null"
                ]
              },
              "tool": {
                "additionalProperties": false,
                "description": "使用する計算ツール（ある場合）",
                "example": "Mathematica",
                "type": [
                  "string",
                  "null"
                ]
              }
            },
            "required": [
              "section",
              "idx",
              "subidx",
              "name",
              "measurement_conditions",
              "experiment_type",
              "reference",
              "tool"
            ],
            "type": "object"
          },
          "title": "experiments",
          "type": "array"
        }
      },
      "required": [
        "experiments"
      ],
      "title": "experiments_output",
      "type": "object"
    },
    strict: true
  }
}

export const DESCRIPTION_SYSTEM_PROMPT = `
以下の実験データに対して、description_briefを生成してJSON形式で出力してください。


実験データ:

{{experiment_with_figures}}


description_brief生成ルール:


【測定実験の場合】

テンプレート: "〜において、〜を測定した結果を表X.Xおよび図X.Xに示す。"

例: "エミッタ接地回路において、IB = 20, 40, 60 μAの各ベース電流に対するIC - VCE特性を測定した結果を表5.1および図5.1に示す。"


【計算実験の場合】

テンプレート: "〜を用いて〜を計算した結果を図X.Xに示す。"

例: "実験で使用した素子の値(表5.2)を用いて1次低域フィルタのステップ応答波形をMathematicaで計算した結果を図5.11に示す。"


【分析実験の場合】

テンプレート: "〜の結果を整理して〜を作成し、〜を求めた結果を表X.Xに示す。"

例: "実験1.1の結果を整理してIC - IBグラフを作成し、最小二乗法により近似直線を引いた結果を図5.3に示す。この近似直線の傾きからエミッタ接地電流増幅率βを求めた結果を表5.3に示す。"


注意点:

1. 測定条件（measurement_conditions）を必ず含める

2. 図表番号（tables, figures）を正確に記載

3. 使用した回路図への参照は含めない

4. 簡潔に1〜2文で記述


各実験データにdescription_briefフィールドを追加して、JSON配列形式で出力してください。

他のテキストは含めないでください。`

export const DESCRIPTION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "experiments_with_descriptions",
    schema: {
      "additionalProperties": false,
      "properties": {
        "experiments": {
          "additionalProperties": false,
          "description": "説明文が追加された実験データのリスト",
          "items": {
            "additionalProperties": false,
            "properties": {
              "description_brief": {
                "additionalProperties": false,
                "description": "実験の簡潔な説明文（1〜2文）。測定条件と図表番号を含む。",
                "example": "エミッタ接地回路において、IB = 20, 40, 60 μAの各ベース電流に対するIC - VCE特性を測定した結果を表5.1および図5.1に示す。",
                "type": "string"
              },
              "experiment_type": {
                "additionalProperties": false,
                "description": "実験の種類",
                "enum": [
                  "測定",
                  "計算",
                  "分析"
                ],
                "type": "string"
              },
              "figures": {
                "additionalProperties": false,
                "description": "この実験に関連する図のリスト",
                "items": {
                  "additionalProperties": false,
                  "properties": {
                    "label": {
                      "additionalProperties": false,
                      "description": "図のラベル",
                      "example": "図5.1",
                      "type": "string"
                    },
                    "number": {
                      "additionalProperties": false,
                      "description": "図の通し番号",
                      "example": 1,
                      "type": "integer"
                    },
                    "type": {
                      "additionalProperties": false,
                      "description": "図の種類",
                      "enum": [
                        "graph"
                      ],
                      "type": "string"
                    }
                  },
                  "required": [
                    "number",
                    "label",
                    "type"
                  ],
                  "type": "object"
                },
                "type": "array"
              },
              "idx": {
                "additionalProperties": false,
                "description": "実験の大項目番号",
                "example": 1,
                "type": "integer"
              },
              "measurement_conditions": {
                "additionalProperties": false,
                "description": "測定条件（パラメータと値）",
                "example": "IB = 20, 40, 60 μA",
                "type": "string"
              },
              "name": {
                "additionalProperties": false,
                "description": "実験項目の名称",
                "example": "IC - VCE特性の測定",
                "type": "string"
              },
              "reference": {
                "additionalProperties": false,
                "description": "参照する他の実験や表（ある場合）",
                "example": "実験1.1",
                "type": [
                  "string",
                  "null"
                ]
              },
              "section": {
                "additionalProperties": false,
                "description": "実験書のセクション番号",
                "example": "4.1.1",
                "type": "string"
              },
              "subidx": {
                "additionalProperties": false,
                "description": "実験の小項目番号（ない場合はnull）",
                "example": 1,
                "type": [
                  "integer",
                  "null"
                ]
              },
              "tables": {
                "additionalProperties": false,
                "description": "この実験に関連する表のリスト",
                "items": {
                  "additionalProperties": false,
                  "properties": {
                    "label": {
                      "additionalProperties": false,
                      "description": "表のラベル",
                      "example": "表5.1",
                      "type": "string"
                    },
                    "number": {
                      "additionalProperties": false,
                      "description": "表の通し番号",
                      "example": 1,
                      "type": "integer"
                    },
                    "type": {
                      "additionalProperties": false,
                      "description": "表の種類（data: 測定データ, result: 計算結果）",
                      "enum": [
                        "data",
                        "result"
                      ],
                      "type": "string"
                    }
                  },
                  "required": [
                    "number",
                    "label",
                    "type"
                  ],
                  "type": "object"
                },
                "type": "array"
              },
              "tool": {
                "additionalProperties": false,
                "description": "使用する計算ツール（ある場合）",
                "example": "Mathematica",
                "type": [
                  "string",
                  "null"
                ]
              }
            },
            "required": [
              "section",
              "idx",
              "subidx",
              "name",
              "measurement_conditions",
              "experiment_type",
              "tool",
              "reference",
              "tables",
              "figures",
              "description_brief"
            ],
            "type": "object"
          },
          "type": "array"
        }
      },
      "required": [
        "experiments"
      ],
      "type": "object"
    },
    strict: true
  }
}

export const SUMMARY_SYSTEM_PROMPT = `
あなたは理系大学生であり、与えられた実験書の内容だけを根拠に、レポートの「まとめ（振り返り）」を約300字で作成する。情報源は必ず lab_text のみとし、外部知識や不確かな推測の断定は禁止。文体はだ・である調、本文のみ1段落（改行なし）。数値や結論は lab_text に存在するときのみ用いる。存在しない場合は記述しない。過去形で出力。構成: ①目的と理論の要点 ②装置・手順の肝と注意点（安全事項があれば言及）出力は260〜340字、見出し・箇条書き・引用・絵文字は禁止、句点で終える。本文以外の出力は一切しないこと。難しい言葉は使わずに、日本語が苦手な理系大学生ということを加味して出力に反映させること。

lab_text:

<<<

{{lab_text}}

>>>`

export const SUMMARY_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "summary_300chars",
    schema: {
      "$id": "https://example.com/schemas/summary-300chars.schema.json",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "description": "lab_textのみを情報源とした、だ・である調の約300字1段落。末尾は句点。",
      "properties": {
        "summary": {
          "description": "本文のみ（見出しなし・箇条書きなし・改行なし）。だ・である調、260〜340字、句点で終える。",
          "maxLength": 340,
          "minLength": 260,
          "pattern": "^[^\\r\\n]*。$",
          "type": "string"
        }
      },
      "required": [
        "summary"
      ],
      "title": "実験まとめ（振り返り）オブジェクト",
      "type": "object"
    },
    strict: true
  }
}

export const DISCUSSION_UNIT_SYSTEM_PROMPT = `
【システムプロンプト（改訂版）：考察ユニット生成器】

あなたは「考察ユニット生成器」。与えられた
(1) 考察テキスト（日本語、（１）（２）…などの列挙を含む段落）
(2) 式テキスト（"formulas_in_parentheses": [{equation_number, label_raw, formula_text_raw}, ...] のJSON）
を用いて、各番号ごとの“考察ユニット”を抽出・整形し、JSONで返す。

【やること】
1) 番号分割：
   - 考察テキストを、全角/半角の多様なパターンで厳密に分割する。例： （１）, （ 1 ）, (1), 1), 1．, １．, 1., 1- など。
   - 順序は原文通りに保持。空要素は無視。

2) 文体変換：
   - 各項目の命令形を**能動態・常体**に変換（例：「導出せよ」→「導出する」、「比較し考察せよ」→「比較し，考察する」）。
   - 敬体は禁止。必要に応じて1〜3文に要約・整形するが、意味を変えない。

3) 式参照の抽出：
   - 「式（n）」参照を抽出（ゆれ許容：式( 7 ), 式７, 7式, 39b 等）。英小文字接尾は数値を優先。
   - 推奨正規表現例：(?i)(式?\\s*[\\(（]?\\s*(\\d+)\\s*[\\)）]?\\s*[a-z]?)|(\\b(\\d+)[a-z]?\\s*式)

4) 式JSONとの突合：
   - "formulas_in_parentheses" の {equation_number, label_raw, formula_text_raw} と数値一致で照合。
   - 見つかった式は \`formulas_used\`、未検出番号は \`missing_formula_numbers\`（昇順・重複なし）。

5) 参考文献の付与（最低3件）：
   - トップレベル \`references\` に集約、各要素に 1 始まりの \`id\`。
   - **全体で少なくとも3件（min=3）**を出力する。実在の日本語資料（教科書、学会誌、JIS/官公庁、大学公式）を優先。
   - 3件に満たない場合、分野に即した**プレースホルダ文献**で補完（\`notes: "placeholder"\` を必須）。
   - 各ユニットの \`reference_ids\` に参照IDを列挙し、\`discussion_active\` の末尾に [n] を付す（複数可）。
   - 不要なユニットは \`reference_ids\` を空配列、文末番号も付さない。

6) 文献フォーマット出力：
   - トップレベル \`reference_list_formatted\` に文字列配列で出力。
   - 形式：\`[1]{文献名}日付\`（例：\`[1]電子回路 基礎と応用（第3版） 2018-04-10\`）
   - 日付は \`"YYYY"\` または \`"YYYY-MM-DD"\`。URL等は \`references\` 側に保持。

7) 出力：
   - トップレベル object として \`units\`, \`total_count\`, \`references\`, \`reference_list_formatted\` を返す。
   - 各ユニット：
     - \`index\`（1始まり整数）
     - \`discussion_active\`（整形後テキスト。必要時末尾に [n]）
     - \`formula_numbers\`（整数配列；昇順・重複なし）
     - \`formulas_used\`（式オブジェクト配列）
     - \`missing_formula_numbers\`（整数配列）
     - \`reference_ids\`（整数配列；昇順・重複なし）
   - nullは禁止。空は空配列/空文字を用いる。
   - 入力欠損時も可能な範囲で処理し、未参照は空配列で可視化。
   - **最終出力は JSON のみ**とし、説明文は一切含めない。


【安全策】
- unitsが0件でも \`{ "units": [], "total_count": 0, "references": [], "reference_list_formatted": [] }\` を必ず返す（ただし通常は \`references\` を min=3 とする）。`
