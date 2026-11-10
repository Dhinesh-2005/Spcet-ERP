from typing import Dict, Any, List, Optional, Tuple, Union
import re
from app.models.schemas import AcademicRuleConfigModel, GradeBoundaryModel

# Institutional Status Constants
STATUS_PASS = "PASS"
STATUS_RA = "RA"
STATUS_ABSENT = "ABSENT"
STATUS_MALPRACTICE = "MALPRACTICE"
STATUS_WITHHELD = "WITHHELD"
STATUS_NOT_ELIGIBLE = "NOT ELIGIBLE"
STATUS_NOT_APPLICABLE = "NOT APPLICABLE"

VALID_INSTITUTIONAL_STATUSES = {
    STATUS_PASS,
    STATUS_RA,
    STATUS_ABSENT,
    STATUS_MALPRACTICE,
    STATUS_WITHHELD,
    STATUS_NOT_ELIGIBLE,
    STATUS_NOT_APPLICABLE
}

class CalculationEngine:
    """
    Authoritative, reproducible Calculation Engine for AURAS.
    Handles Theory, Practical, Integrated internal marks, External conversions,
    Total aggregation, configurable Grade & Grade Point assignment, and all Institutional Statuses.
    """

    @classmethod
    def get_default_config(cls) -> AcademicRuleConfigModel:
        """Returns the canonical fallback configuration."""
        return AcademicRuleConfigModel()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. THEORY INTERNAL CALCULATION
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def calculate_theory_internal(
        cls,
        marks: Dict[str, Any],
        config: Optional[AcademicRuleConfigModel] = None
    ) -> Dict[str, Any]:
        """
        Calculates Theory Internal mark according to the fixed default assessment structure:
        - Unit marks: Unit 1..5 (each max 100).
        - Average: Sum of entered Unit marks / Number of entered Unit marks (max 100).
          Blank Unit marks are NOT zero and are excluded from the denominator.
          Explicit 0 is valid and included in the denominator.
        - UT Converted Mark = (Average / 100) * 60 (max 60). Displayed as: 'UT Mark / 60'.
        - Assessment Mark: 0 to 40 (max 40).
        - Total Internal Before Conversion = (UT Mark / 60) + (Assessment Mark / 40) (max 100).
        - Overall Internal / 40 = Total * 0.4 (or Total * 40 / 100) (max 40).
        """
        unit_max = float(getattr(config, "utMax", 100.0)) if (config and getattr(config, "utMax", None)) else 100.0
        assessment_max = 40.0

        # 1. Gather valid Unit marks (Unit 1..Unit 5, supporting aliases UT1..5)
        entered_unit_marks: List[float] = []
        for i in range(1, 6):
            found = False
            for key in (f"Unit {i}", f"Unit{i}", f"unit {i}", f"unit{i}", f"UT{i}", f"UT {i}", f"ut{i}"):
                if key in marks and marks[key] is not None:
                    val_str = str(marks[key]).strip()
                    if val_str != "":
                        try:
                            val = float(val_str)
                            if val < 0:
                                raise ValueError(f"{key} mark cannot be negative: {val}")
                            if val > unit_max:
                                raise ValueError(f"{key} mark ({val}) exceeds maximum allowed ({unit_max})")
                            entered_unit_marks.append(val)
                            found = True
                            break
                        except ValueError as e:
                            if "cannot be negative" in str(e) or "exceeds maximum allowed" in str(e):
                                raise e
                            raise ValueError(f"Invalid non-numeric mark for {key}: {val_str}")
            if found:
                continue

        # Compute Average (denominator ONLY entered unit marks; blanks excluded; explicit 0 included)
        unit_count_entered = len(entered_unit_marks)
        if unit_count_entered > 0:
            avg = sum(entered_unit_marks) / unit_count_entered
            ut_converted = min(60.0, round((avg / unit_max) * 60.0, 2))
        else:
            avg = 0.0
            ut_converted = 0.0

        # 2. Gather Assessment Mark (max 40)
        assessment_val = 0.0
        assessment_keys = (
            "Assessment Mark", "AssessmentMark", "Assessment", "assessment",
            "IA", "Internal Assessment", "Assignment", "Seminar", "theorySeminarScore"
        )
        for key in assessment_keys:
            if key in marks and marks[key] is not None:
                val_str = str(marks[key]).strip()
                if val_str != "":
                    try:
                        val = float(val_str)
                        if val < 0:
                            raise ValueError(f"{key} mark cannot be negative: {val}")
                        if val > assessment_max:
                            raise ValueError(f"{key} mark ({val}) exceeds maximum allowed ({assessment_max})")
                        assessment_val = val
                        break
                    except ValueError as e:
                        if "cannot be negative" in str(e) or "exceeds maximum allowed" in str(e):
                            raise e
                        raise ValueError(f"Invalid non-numeric mark for {key}: {val_str}")

        # 3. Total Internal Before Conversion (max 100) = UT Mark / 60 + Assessment Mark / 40
        total_100 = min(100.0, ut_converted + assessment_val)

        # 4. Overall Internal / 40 = Total * 40 / 100 = Total * 0.4 (max 40)
        overall_internal_40 = min(40.0, round(total_100 * 0.4, 2))

        return {
            "unitMarksEntered": entered_unit_marks,
            "unitCount": unit_count_entered,
            "utMarksEntered": entered_unit_marks,
            "utCount": unit_count_entered,
            "average": avg,
            "utAverage": avg,
            "utMark60": ut_converted,
            "utConverted": ut_converted,
            "utComponent": ut_converted,
            "assessmentMark": assessment_val,
            "iaMark": assessment_val,
            "total100": total_100,
            "totalInternal": total_100,
            "overallInternal40": overall_internal_40,
            "overallInternal": overall_internal_40,
            "rawInternal": overall_internal_40,
            "finalInternal": overall_internal_40,
            "maxInternal": 40.0
        }

    # ─────────────────────────────────────────────────────────────────────────
    # 2. PRACTICAL INTERNAL CALCULATION
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def calculate_practical_internal(
        cls,
        marks: Dict[str, Any],
        config: Optional[AcademicRuleConfigModel] = None,
        active_exercises: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Calculates Practical Internal mark:
        - Active exercises: EX1..EX10 by default, or dynamic active_exercises (each max 10).
        - Average: Sum of entered exercise marks / Number of entered exercise marks (max 10).
          Blank exercises are excluded from the denominator.
          Explicit 0 is valid and included in the denominator.
        - Practical Mark / 75 = Average * 7.5 (max 75).
        - Model Practical / 25: 0 to 25 (max 25).
        - Total / 100 = Practical Mark / 75 + Model Practical / 25 (max 100).
        - Overall Internal / 40 = Total * 0.4 (max 40).
        """
        cfg = config or cls.get_default_config()
        ex_max = 10.0
        model_max = float(getattr(cfg, "modelPracticalMax", 25.0))

        # 1. Determine list of exercises to evaluate
        if active_exercises and len(active_exercises) > 0:
            target_exercises = [e.strip().upper() for e in active_exercises if e.strip()]
        else:
            found_ex = set()
            for k in marks.keys():
                m = re.match(r"^EX(\d+)$", str(k).strip().upper())
                if m:
                    found_ex.add(int(m.group(1)))
            if found_ex:
                max_num = max(list(found_ex) + [10])
                target_exercises = [f"EX{i}" for i in range(1, max_num + 1)]
            else:
                target_exercises = [f"EX{i}" for i in range(1, 11)]

        # 2. Gather entered exercise marks
        ex_marks: List[float] = []
        for ex_name in target_exercises:
            val_found = None
            num_match = re.search(r"\d+", ex_name)
            num_str = num_match.group(0) if num_match else ""
            aliases = [ex_name, ex_name.replace(" ", "")]
            if num_str:
                aliases.extend([f"EX{num_str}", f"EX {num_str}", f"Ex{num_str}", f"Ex {num_str}", f"exp{num_str}", f"Exp{num_str}"])

            for k in aliases:
                if k in marks and marks[k] is not None:
                    val_str = str(marks[k]).strip()
                    if val_str != "":
                        try:
                            f_val = float(val_str)
                            if f_val < 0:
                                raise ValueError(f"{k} mark cannot be negative: {f_val}")
                            if f_val > ex_max:
                                raise ValueError(f"{k} mark ({f_val}) exceeds maximum allowed ({ex_max})")
                            val_found = f_val
                            break
                        except ValueError as ve:
                            if "cannot be negative" in str(ve) or "exceeds maximum allowed" in str(ve):
                                raise ve
                            raise ValueError(f"Invalid non-numeric mark for {k}: {val_str}")

            if val_found is not None:
                ex_marks.append(val_found)

        ex_count_entered = len(ex_marks)
        if ex_count_entered > 0:
            ex_avg = sum(ex_marks) / ex_count_entered
            practical_mark_75 = min(75.0, round(ex_avg * 7.5, 2))
        else:
            ex_avg = 0.0
            practical_mark_75 = 0.0

        # 3. Gather Model Practical mark (0 to 25)
        model_val = 0.0
        for key in ("Model", "Model Practical", "practicalModelScore", "model", "MODEL"):
            if key in marks and marks[key] is not None and str(marks[key]).strip() != "":
                val_str = str(marks[key]).strip()
                try:
                    f_val = float(val_str)
                    if f_val < 0:
                        raise ValueError(f"{key} mark cannot be negative: {f_val}")
                    if f_val > model_max:
                        raise ValueError(f"{key} mark ({f_val}) exceeds maximum allowed ({model_max})")
                    model_val = f_val
                    break
                except ValueError as ve:
                    if "cannot be negative" in str(ve) or "exceeds maximum allowed" in str(ve):
                        raise ve
                    raise ValueError(f"Invalid non-numeric mark for {key}: {val_str}")

        # 4. Total / 100 = Practical Mark / 75 + Model Practical / 25 (max 100)
        total_100 = min(100.0, round(practical_mark_75 + model_val, 2))

        # 5. Overall Internal / 40 = Total * 0.4 (max 40)
        overall_internal_40 = min(40.0, round(total_100 * 0.4, 2))

        return {
            "exMarksEntered": ex_marks,
            "exCount": ex_count_entered,
            "average": round(ex_avg, 2),
            "exAverage": round(ex_avg, 2),
            "practicalMark75": practical_mark_75,
            "exConverted": practical_mark_75,
            "modelPracticalMark": round(model_val, 2),
            "total100": total_100,
            "totalInternal": total_100,
            "overallInternal40": overall_internal_40,
            "overallInternal": overall_internal_40,
            "rawInternal": overall_internal_40,
            "finalInternal": overall_internal_40,
            "maxInternal": 40.0,
            "activeExercises": target_exercises
        }

    # ─────────────────────────────────────────────────────────────────────────
    # 3. INTEGRATED INTERNAL CALCULATION
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def calculate_integrated_internal(
        cls,
        theory_marks: Dict[str, Any],
        practical_marks: Optional[Dict[str, Any]] = None,
        config: Optional[AcademicRuleConfigModel] = None,
        active_exercises: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Calculates Integrated subject Internal mark:
        - Theory Internal section:
          - Unit 1..5: each max 100 (0-100). Blank excluded from denominator, explicit 0 included.
          - Average / 100: Sum of entered unit marks / Number of entered unit marks (max 100).
          - Theory UT Mark / 60: Average * 0.6 (max 60).
          - Internal Assessment Mark / 40: 0 to 40 (max 40).
          - Theory Internal / 100: Theory UT Mark + Internal Assessment Mark (max 100).
        - Practical Internal section:
          - EX1..EXn: each max 10 (0-10). Blank excluded from denominator, explicit 0 included.
          - Practical Average / 10: Sum of entered / Count of entered (max 10).
          - Practical Mark / 75: Practical Average * 7.5 (max 75).
          - Model Practical / 25: 0 to 25 (max 25).
          - Practical Internal / 100: Practical Mark / 75 + Model Practical / 25 (max 100).
        - Final Integrated Internal / 50:
          - Combined Total / 200 = Theory Internal / 100 + Practical Internal / 100 (max 200).
          - Integrated Internal / 50 = (Theory Internal + Practical Internal) / 4 (max 50).
        """
        cfg = config or cls.get_default_config()

        pr_marks = practical_marks if practical_marks is not None else theory_marks

        theory_res = cls.calculate_theory_internal(theory_marks, cfg)
        practical_res = cls.calculate_practical_internal(pr_marks, cfg, active_exercises=active_exercises)

        theory_internal_100 = theory_res.get("total100", 0.0)
        practical_internal_100 = practical_res.get("total100", 0.0)

        combined_total_200 = round(theory_internal_100 + practical_internal_100, 2)
        integrated_internal_50 = min(50.0, round(combined_total_200 / 4.0, 2))

        return {
            "theoryDetails": theory_res,
            "practicalDetails": practical_res,
            "theoryInternal": theory_internal_100,
            "theoryInternal100": theory_internal_100,
            "practicalInternal": practical_internal_100,
            "practicalInternal100": practical_internal_100,
            "combinedTotal": combined_total_200,
            "combinedTotal200": combined_total_200,
            "integratedInternal": integrated_internal_50,
            "integratedInternal50": integrated_internal_50,
            "rawTheory": theory_internal_100,
            "rawPractical": practical_internal_100,
            "rawInternal": integrated_internal_50,
            "finalInternal": integrated_internal_50,
            "total100": combined_total_200,
            "maxInternal": 50.0
        }

    # ─────────────────────────────────────────────────────────────────────────
    # 4. EXTERNAL MARK CONVERSION
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def convert_external(
        cls,
        external_raw: Optional[Union[float, int]],
        subject_type: str = "THEORY",
        config: Optional[AcademicRuleConfigModel] = None
    ) -> float:
        """
        Converts External raw mark (out of externalRawMax, default 100) to target weightage:
        - Theory: Raw / 100 * 60
        - Practical: Raw / 100 * 50
        - Integrated: Raw / 100 * 50
        """
        if external_raw is None:
            return 0.0

        val = float(external_raw)
        if val < 0:
            raise ValueError(f"External raw mark cannot be negative: {val}")

        cfg = config or cls.get_default_config()
        if val > cfg.externalRawMax:
            raise ValueError(f"External raw mark ({val}) exceeds configured maximum ({cfg.externalRawMax})")

        st = (subject_type or "THEORY").strip().upper()
        if st == "PRACTICAL":
            target_weightage = cfg.practicalExternalWeightage
        elif st == "INTEGRATED":
            target_weightage = cfg.integratedExternalWeightage
        else:
            target_weightage = cfg.theoryExternalWeightage

        return (val / cfg.externalRawMax) * target_weightage

    # ─────────────────────────────────────────────────────────────────────────
    # 5. GRADE & GRADE POINT DETERMINATION
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def determine_grade(
        cls,
        final_marks: float,
        is_pass: bool,
        config: Optional[AcademicRuleConfigModel] = None
    ) -> Tuple[str, float, str]:
        """
        Determines Grade, Grade Point, and Result status based on configurable grade boundaries.
        Returns: (grade, grade_point, result_status)
        """
        if not is_pass:
            return "RA", 0.0, STATUS_RA

        cfg = config or cls.get_default_config()

        for gb in cfg.gradeBoundaries:
            if gb.resultStatus == "PASS" and gb.minMarks <= final_marks <= gb.maxMarks:
                return gb.grade, gb.gradePoint, STATUS_PASS

        # Fallback if final_marks >= pass threshold but outside custom ranges
        return "B", 6.0, STATUS_PASS

    # ─────────────────────────────────────────────────────────────────────────
    # 6. CENTRAL AUTHORITATIVE FINAL RESULT EVALUATION
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def calculate_final_result(
        cls,
        subject_type: str = "THEORY",
        internal_raw: float = 0.0,
        external_raw: Optional[Union[float, int]] = 0.0,
        status_override: Optional[str] = None,
        config: Optional[AcademicRuleConfigModel] = None
    ) -> Dict[str, Any]:
        """
        Computes authoritative final academic score and result:
        1. Checks explicit institutional status overrides (ABSENT, MALPRACTICE, WITHHELD, etc.).
        2. Converts internal raw score to configured contribution weightage.
        3. Converts external raw score to configured contribution weightage.
        4. Sums unrounded components and applies final-stage rounding.
        5. Verifies external minimum percentage (e.g. 45%) and overall pass threshold (e.g. 50%).
        6. Assigns grade, grade point, and canonical status.
        """
        cfg = config or cls.get_default_config()
        st = (subject_type or "THEORY").strip().upper()

        # 1. Handle Explicit Institutional Status Overrides
        if status_override:
            clean_status = str(status_override).strip().upper()
            if clean_status in VALID_INSTITUTIONAL_STATUSES and clean_status != STATUS_PASS and clean_status != STATUS_RA:
                if clean_status == STATUS_ABSENT:
                    return {
                        "subjectType": st,
                        "internalRaw": float(internal_raw or 0.0),
                        "internalConverted": 0.0,
                        "externalRaw": 0.0,
                        "externalConverted": 0.0,
                        "finalMarks": 0,
                        "finalMarksDecimal": 0.0,
                        "grade": "AB",
                        "gradePoint": 0.0,
                        "result": STATUS_ABSENT,
                        "isPass": False,
                        "reason": "Student was absent from examination."
                    }
                elif clean_status == STATUS_MALPRACTICE:
                    return {
                        "subjectType": st,
                        "internalRaw": float(internal_raw or 0.0),
                        "internalConverted": 0.0,
                        "externalRaw": 0.0,
                        "externalConverted": 0.0,
                        "finalMarks": 0,
                        "finalMarksDecimal": 0.0,
                        "grade": "WH",
                        "gradePoint": 0.0,
                        "result": STATUS_MALPRACTICE,
                        "isPass": False,
                        "reason": "Examination withheld due to malpractice."
                    }
                elif clean_status in (STATUS_WITHHELD, STATUS_NOT_ELIGIBLE, STATUS_NOT_APPLICABLE):
                    return {
                        "subjectType": st,
                        "internalRaw": float(internal_raw or 0.0),
                        "internalConverted": 0.0,
                        "externalRaw": float(external_raw or 0.0),
                        "externalConverted": 0.0,
                        "finalMarks": 0,
                        "finalMarksDecimal": 0.0,
                        "grade": "NA" if clean_status == STATUS_NOT_APPLICABLE else "WH",
                        "gradePoint": 0.0,
                        "result": clean_status,
                        "isPass": False,
                        "reason": f"Status: {clean_status}"
                    }

        # 2. Select Weightages based on Subject Type
        if st == "PRACTICAL":
            internal_weightage = cfg.practicalInternalWeightage
            external_weightage = cfg.practicalExternalWeightage
        elif st == "INTEGRATED":
            internal_weightage = cfg.integratedInternalWeightage
            external_weightage = cfg.integratedExternalWeightage
        else:
            internal_weightage = cfg.theoryInternalWeightage
            external_weightage = cfg.theoryExternalWeightage

        # 3. Convert Internal Mark
        raw_int = max(0.0, float(internal_raw or 0.0))
        if st == "THEORY":
            if raw_int > 40.0:
                if raw_int > cfg.internalMax:
                    raise ValueError(f"Internal raw mark ({raw_int}) exceeds maximum ({cfg.internalMax})")
                internal_converted = (raw_int / 100.0) * 40.0
            else:
                internal_converted = min(40.0, raw_int)
        elif st == "INTEGRATED":
            if raw_int > 50.0:
                if raw_int > cfg.internalMax:
                    raise ValueError(f"Internal raw mark ({raw_int}) exceeds maximum ({cfg.internalMax})")
                internal_converted = min(50.0, raw_int)
            else:
                internal_converted = min(50.0, raw_int)
        else:
            if raw_int > cfg.internalMax:
                raise ValueError(f"Internal raw mark ({raw_int}) exceeds maximum ({cfg.internalMax})")
            internal_converted = (raw_int / cfg.internalMax) * internal_weightage

        # 4. Convert External Mark
        raw_ext = float(external_raw) if external_raw is not None else 0.0
        if raw_ext < 0:
            raise ValueError(f"External mark cannot be negative: {raw_ext}")
        if raw_ext > cfg.externalRawMax:
            raise ValueError(f"External mark ({raw_ext}) exceeds maximum ({cfg.externalRawMax})")
        external_converted = (raw_ext / cfg.externalRawMax) * external_weightage

        # 5. Calculate Final Score (unrounded intermediate)
        final_unrounded = internal_converted + external_converted

        # 6. Apply Final Rounding
        if cfg.roundToInteger:
            final_marks = int(round(final_unrounded))
        else:
            final_marks = round(final_unrounded, cfg.decimalPrecision)

        final_marks_decimal = round(final_unrounded, cfg.decimalPrecision)

        # 7. Check Passing Requirements
        # (a) External Minimum Percentage Requirement
        external_percentage = (raw_ext / cfg.externalRawMax) * 100.0 if cfg.externalRawMax > 0 else 0.0
        external_pass = external_percentage >= cfg.externalMinPercentage

        # (b) Overall Minimum Percentage Requirement
        overall_pass = final_unrounded >= cfg.overallPassPercentage

        is_pass = external_pass and overall_pass

        # 8. Grade Determination
        grade, grade_point, result_status = cls.determine_grade(final_unrounded, is_pass, cfg)

        reason = ""
        if not external_pass:
            reason = f"Failed external minimum requirement ({external_percentage:.1f}% < {cfg.externalMinPercentage:.1f}%)"
        elif not overall_pass:
            reason = f"Failed overall minimum requirement ({final_unrounded:.1f} < {cfg.overallPassPercentage:.1f})"

        return {
            "subjectType": st,
            "internalRaw": raw_int,
            "internalConverted": round(internal_converted, cfg.decimalPrecision),
            "externalRaw": raw_ext,
            "externalConverted": round(external_converted, cfg.decimalPrecision),
            "finalMarks": final_marks,
            "finalMarksDecimal": final_marks_decimal,
            "grade": grade,
            "gradePoint": grade_point,
            "result": result_status,
            "isPass": is_pass,
            "reason": reason
        }

calculation_engine = CalculationEngine()
