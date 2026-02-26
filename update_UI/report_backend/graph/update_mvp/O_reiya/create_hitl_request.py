from __future__ import annotations

from graph.state import (
    AgentState,
    FieldOption,
    FieldSpec,
    HITLFormSpec,
    HITLRequest,
    JobStatus,
    QualityIssue,
    now_iso,
)


def _result_no_options(state: AgentState) -> list[FieldOption]:
    options: list[FieldOption] = []
    if not state.results_page:
        return options
    seen = set()
    for section in state.results_page.sections:
        for group in section.groups:
            result_no = (group.result_no or "").strip()
            if result_no and result_no not in seen:
                options.append(FieldOption(value=result_no, label=result_no))
                seen.add(result_no)
    return options


def _exp_key_options(state: AgentState) -> list[FieldOption]:
    options: list[FieldOption] = []
    for exp in state.experiments:
        if exp.idx:
            label = exp.name or exp.idx
            options.append(FieldOption(value=exp.idx, label=label))
    return options


def _excel_file_options(state: AgentState) -> list[FieldOption]:
    options: list[FieldOption] = []
    for excel in state.excel_files:
        if excel.excel_id:
            label = excel.filename or excel.excel_id
            options.append(FieldOption(value=excel.excel_id, label=label))
    return options


def _default_form_spec(state: AgentState, issue: QualityIssue) -> HITLFormSpec:
    result_no_options = _result_no_options(state)
    exp_key_options = _exp_key_options(state)
    excel_file_options = _excel_file_options(state)

    if issue.code == "HITL_METHOD_TO_RESULT_MAPPING":
        return HITLFormSpec(
            title="方法→結果対応の確定",
            description="実験のmethod番号とresult番号を確定してください。",
            rewind_target=issue.rewind_target or "B.MapResultNumbers",
            fields=[
                FieldSpec(
                    field_id="exp_key",
                    name="exp_key",
                    label="実験ID",
                    type="single_select",
                    required=True,
                    options=exp_key_options,
                ),
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="method_no",
                    name="method_no",
                    label="方法番号（任意）",
                    type="text",
                    required=False,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_DISCUSSION_SECTION_UNKNOWN":
        return HITLFormSpec(
            title="考察範囲の指定",
            description="考察セクションの範囲を指定してください。",
            rewind_target=issue.rewind_target or "B.LocateDiscussionSection",
            fields=[
                FieldSpec(
                    field_id="section_id",
                    name="section_id",
                    label="セクションID",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="title",
                    name="title",
                    label="セクションタイトル",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="start_page",
                    name="start_page",
                    label="開始ページ",
                    type="number",
                    required=True,
                ),
                FieldSpec(
                    field_id="end_page",
                    name="end_page",
                    label="終了ページ",
                    type="number",
                    required=True,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_EXCEL_SHEET_UNKNOWN":
        return HITLFormSpec(
            title="Excelシート選択",
            description="対象シートを選択してください。",
            rewind_target=issue.rewind_target or "E.SelectExcelSheetPerExperiment",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="excel_file_id",
                    name="excel_file_id",
                    label="Excelファイル",
                    type="single_select",
                    required=True,
                    options=excel_file_options,
                ),
                FieldSpec(
                    field_id="sheet_name",
                    name="sheet_name",
                    label="シート名",
                    type="text",
                    required=True,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_TABLE_COLUMN_MAPPING_UNKNOWN":
        return HITLFormSpec(
            title="表の列対応",
            description="列名/参照/単位をJSONで指定してください。",
            rewind_target=issue.rewind_target or "E.BindTableColumnsAndUnits",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="table_id",
                    name="table_id",
                    label="テーブルID",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="columns_json",
                    name="columns_json",
                    label="列定義(JSON)",
                    type="textarea",
                    required=True,
                    help="[{\"name\":\"列名\",\"col_ref\":\"A\",\"unit\":\"V\"}]",
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_UNIT_UNKNOWN":
        return HITLFormSpec(
            title="単位の確定",
            description="単位を指定してください。",
            rewind_target=issue.rewind_target or "F.ResolveAxesAndUnits",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="target",
                    name="target",
                    label="対象",
                    type="single_select",
                    required=True,
                    options=[
                        FieldOption(value="table", label="表列"),
                        FieldOption(value="axis", label="軸"),
                    ],
                ),
                FieldSpec(
                    field_id="table_id",
                    name="table_id",
                    label="テーブルID(表列の場合)",
                    type="text",
                    required=False,
                ),
                FieldSpec(
                    field_id="column_name",
                    name="column_name",
                    label="列名/参照(表列の場合)",
                    type="text",
                    required=False,
                ),
                FieldSpec(
                    field_id="axis",
                    name="axis",
                    label="軸(x/y)",
                    type="single_select",
                    required=False,
                    options=[
                        FieldOption(value="x", label="x"),
                        FieldOption(value="y", label="y"),
                    ],
                ),
                FieldSpec(
                    field_id="unit",
                    name="unit",
                    label="単位",
                    type="unit_select",
                    required=True,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_AXIS_LABEL_UNKNOWN":
        return HITLFormSpec(
            title="軸ラベルの確定",
            description="x/yラベルと単位を指定してください。",
            rewind_target=issue.rewind_target or "F.ResolveAxesAndUnits",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="x_column",
                    name="x_column",
                    label="x列(番号)",
                    type="number",
                    required=True,
                ),
                FieldSpec(
                    field_id="y_columns",
                    name="y_columns",
                    label="y列(カンマ区切り)",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="x_label",
                    name="x_label",
                    label="xラベル",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="y_label",
                    name="y_label",
                    label="yラベル",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="x_unit",
                    name="x_unit",
                    label="x単位",
                    type="unit_select",
                    required=True,
                ),
                FieldSpec(
                    field_id="y_unit",
                    name="y_unit",
                    label="y単位",
                    type="unit_select",
                    required=True,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_INSERT_ASSET_UNKNOWN":
        return HITLFormSpec(
            title="資産割当の確定",
            description="asset_idをカンマ区切りで指定してください。",
            rewind_target=issue.rewind_target or "F.BindInsertAssets",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="tables",
                    name="tables",
                    label="表のasset_id(カンマ区切り)",
                    type="text",
                    required=False,
                ),
                FieldSpec(
                    field_id="graphs",
                    name="graphs",
                    label="図のasset_id(カンマ区切り)",
                    type="text",
                    required=False,
                ),
                FieldSpec(
                    field_id="photos",
                    name="photos",
                    label="写真のasset_id(カンマ区切り)",
                    type="text",
                    required=False,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_INSERT_ASSET_MISSING":
        return HITLFormSpec(
            title="資産不足の対応",
            description="不足時の対応を選択してください。",
            rewind_target=issue.rewind_target or "F.BindInsertAssets",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="action",
                    name="action",
                    label="対応",
                    type="single_select",
                    required=True,
                    options=[
                        FieldOption(value="reupload", label="再アップロード"),
                        FieldOption(value="generate", label="生成/補完"),
                        FieldOption(value="proceed_zero", label="0件で進める"),
                    ],
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_THEORY_FORMULA_MISSING":
        return HITLFormSpec(
            title="理論式の入力",
            description="理論式を入力してください。",
            rewind_target=issue.rewind_target or "B.NormalizeAndOMMLifyFormula",
            fields=[
                FieldSpec(
                    field_id="raw_formula",
                    name="raw_formula",
                    label="式(テキスト)",
                    type="textarea",
                    required=True,
                ),
                FieldSpec(
                    field_id="normalized_formula",
                    name="normalized_formula",
                    label="正規化式(任意)",
                    type="textarea",
                    required=False,
                ),
                FieldSpec(
                    field_id="omml",
                    name="omml",
                    label="OMML(任意)",
                    type="textarea",
                    required=False,
                ),
                FieldSpec(
                    field_id="select_as_primary",
                    name="select_as_primary",
                    label="primaryにする",
                    type="single_select",
                    required=True,
                    options=[
                        FieldOption(value="true", label="はい"),
                        FieldOption(value="false", label="いいえ"),
                    ],
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_OMML_CONVERSION_FAILED":
        return HITLFormSpec(
            title="OMML変換の修正",
            description="変換元の式を入力してください。",
            rewind_target=issue.rewind_target or "B.NormalizeAndOMMLifyFormula",
            fields=[
                FieldSpec(
                    field_id="formula_id",
                    name="formula_id",
                    label="式ID",
                    type="text",
                    required=True,
                ),
                FieldSpec(
                    field_id="raw_formula",
                    name="raw_formula",
                    label="式(テキスト)",
                    type="textarea",
                    required=True,
                ),
                FieldSpec(
                    field_id="omml",
                    name="omml",
                    label="OMML(任意)",
                    type="textarea",
                    required=False,
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_THEORY_SUBSTITUTION_MISSING":
        return HITLFormSpec(
            title="理論式の代入値",
            description="代入値をJSONで指定してください。",
            rewind_target=issue.rewind_target or "E.BindTheorySubstitutionParams",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="params_json",
                    name="params_json",
                    label="代入値(JSON)",
                    type="textarea",
                    required=True,
                    help="{\"R\":{\"value\":1000,\"unit\":\"ohm\"}}",
                ),
            ],
            submit_label="確定",
        )

    if issue.code == "HITL_REQUIRED_OUTPUTS_UNKNOWN":
        return HITLFormSpec(
            title="必要出力数の確定",
            description="表/グラフ/写真の必要数を指定してください。",
            rewind_target=issue.rewind_target or "D.InferRequiredOutputs",
            fields=[
                FieldSpec(
                    field_id="result_no",
                    name="result_no",
                    label="結果番号",
                    type="single_select",
                    required=True,
                    options=result_no_options,
                ),
                FieldSpec(
                    field_id="tables_count",
                    name="tables_count",
                    label="表の数",
                    type="number",
                    required=True,
                ),
                FieldSpec(
                    field_id="graphs_count",
                    name="graphs_count",
                    label="グラフの数",
                    type="number",
                    required=True,
                ),
                FieldSpec(
                    field_id="photos_count",
                    name="photos_count",
                    label="写真の数",
                    type="number",
                    required=True,
                ),
            ],
            submit_label="確定",
        )

    return HITLFormSpec(
        title="HITL対応",
        description="必要な情報を入力してください。",
        rewind_target=issue.rewind_target or "",
        fields=[
            FieldSpec(
                field_id="payload_json",
                name="payload_json",
                label="回答(JSON)",
                type="textarea",
                required=True,
            )
        ],
        submit_label="確定",
    )


def _build_context(state: AgentState) -> dict:
    context: dict[str, object] = {}
    if state.results_page:
        context["result_nos"] = [
            group.result_no
            for section in state.results_page.sections
            for group in section.groups
            if group.result_no
        ]
    return context


def _append_hitl_issue(state: AgentState, *, code: str, message: str, rewind_target: str) -> None:
    if any(issue.code == code and issue.severity == "HITL" for issue in state.quality_report.issues):
        return
    state.quality_report.issues.append(
        QualityIssue(
            code=code,
            stage="O.create_hitl_request",
            severity="HITL",
            message=message,
            suggested_action="ask_user",
            rewind_target=rewind_target,
        )
    )


def _ensure_hitl_issue_from_flags(state: AgentState) -> None:
    if state.pdf.needs_hitl_discussion:
        _append_hitl_issue(
            state,
            code="HITL_DISCUSSION_SECTION_UNKNOWN",
            message="Discussion section is unknown.",
            rewind_target="B.LocateDiscussionSection",
        )
        return
    if state.pdf.needs_hitl_methods:
        _append_hitl_issue(
            state,
            code="HITL_METHOD_TO_RESULT_MAPPING",
            message="Method numbers could not be extracted.",
            rewind_target="B.ExtractMethodNumbers",
        )
        return
    if state.required_outputs_hitl.enabled:
        _append_hitl_issue(
            state,
            code="HITL_REQUIRED_OUTPUTS_UNKNOWN",
            message="Required outputs are ambiguous.",
            rewind_target="D.InferRequiredOutputs",
        )
        return
    if state.excel_sheet_hitl.enabled:
        _append_hitl_issue(
            state,
            code=state.excel_sheet_hitl.code or "HITL_EXCEL_SHEET_UNKNOWN",
            message=state.excel_sheet_hitl.message or "Excel sheet selection is missing.",
            rewind_target="E.SelectExcelSheetPerExperiment",
        )
        return
    if state.column_unit_hitl.enabled:
        code = state.column_unit_hitl.codes[0] if state.column_unit_hitl.codes else "HITL_TABLE_COLUMN_MAPPING_UNKNOWN"
        _append_hitl_issue(
            state,
            code=code,
            message=state.column_unit_hitl.message or "Column mapping or units are missing.",
            rewind_target="E.BindTableColumnsAndUnits",
        )
        return
    if state.insert_asset_hitl.enabled:
        code = state.insert_asset_hitl.codes[0] if state.insert_asset_hitl.codes else "HITL_INSERT_ASSET_UNKNOWN"
        _append_hitl_issue(
            state,
            code=code,
            message=state.insert_asset_hitl.message or "Insert assets are missing or unknown.",
            rewind_target="F.BindInsertAssets",
        )
        return
    if state.pdf.needs_hitl_theory:
        if state.pdf.theory_candidates:
            code = "HITL_OMML_CONVERSION_FAILED"
            message = "Failed to convert theory formulas to OMML."
        else:
            code = "HITL_THEORY_FORMULA_MISSING"
            message = "Theory formula is missing."
        _append_hitl_issue(
            state,
            code=code,
            message=message,
            rewind_target="B.NormalizeAndOMMLifyFormula",
        )
        return
    if state.axis_hitl.enabled:
        _append_hitl_issue(
            state,
            code=state.axis_hitl.code or "HITL_AXIS_LABEL_UNKNOWN",
            message=state.axis_hitl.message or "Axis labels or units are missing.",
            rewind_target="F.ResolveAxesAndUnits",
        )


def create_hitl_request(state: AgentState) -> AgentState:
    _ensure_hitl_issue_from_flags(state)
    hitl_issue = next((issue for issue in state.quality_report.issues if issue.severity == "HITL"), None)
    if hitl_issue is None:
        return state

    registry = state.hitl_form_registry or {}
    if hitl_issue.code in registry:
        spec = registry[hitl_issue.code]
    else:
        spec = _default_form_spec(state, hitl_issue)

    request_id = f"{hitl_issue.code}-{now_iso()}"
    rewind_target = hitl_issue.rewind_target or spec.rewind_target

    state.hitl_active = HITLRequest(
        request_id=request_id,
        issue_code=hitl_issue.code,
        title=spec.title,
        description=spec.description,
        rewind_target=rewind_target,
        context=_build_context(state),
        fields=list(spec.fields),
        submit_label=spec.submit_label,
    )
    state.status = JobStatus.waiting_hitl
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["create_hitl_request"]
