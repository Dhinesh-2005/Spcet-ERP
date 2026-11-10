import pytest
from app.services.calculation_engine import (
    calculation_engine,
    CalculationEngine,
    STATUS_PASS,
    STATUS_RA,
    STATUS_ABSENT,
    STATUS_MALPRACTICE,
    STATUS_WITHHELD,
    STATUS_NOT_ELIGIBLE,
    STATUS_NOT_APPLICABLE,
)
from app.models.schemas import AcademicRuleConfigModel, GradeBoundaryModel


# ─────────────────────────────────────────────────────────────────────────────
# 1. THEORY INTERNAL CALCULATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_theory_internal_example_8():
    # Unit 1..5 max 100:
    # Unit 1 = 75, Unit 2 = 90, Unit 3 = 60, Unit 4 = 80, Unit 5 = 70
    # Average = 75, UT Mark / 60 = 45, Assessment Mark = 32, Total / 100 = 77, Overall Internal / 40 = 30.8
    marks = {"Unit 1": 75, "Unit 2": 90, "Unit 3": 60, "Unit 4": 80, "Unit 5": 70, "Assessment Mark": 32}
    res = calculation_engine.calculate_theory_internal(marks)
    assert res["unitCount"] == 5
    assert res["average"] == 75.0
    assert res["utMark60"] == 45.0
    assert res["assessmentMark"] == 32.0
    assert res["total100"] == 77.0
    assert res["overallInternal40"] == 30.8


def test_theory_internal_blank_excluded_example_3():
    # Unit 3 is blank -> excluded from denominator (denominator is 4)
    marks = {"Unit 1": 75, "Unit 2": 90, "Unit 3": "", "Unit 4": 80, "Unit 5": 70}
    res = calculation_engine.calculate_theory_internal(marks)
    assert res["unitCount"] == 4
    assert res["average"] == 78.75
    assert res["utMark60"] == 47.25


def test_theory_internal_explicit_zero_included():
    # Explicit 0 is valid and included in denominator
    marks = {"Unit 1": 0, "Unit 2": 100}
    res = calculation_engine.calculate_theory_internal(marks)
    assert res["unitCount"] == 2
    assert res["average"] == 50.0
    assert res["utMark60"] == 30.0


def test_theory_internal_maximum():
    # Maximum marks: each Unit 100, Assessment 40 -> Total 100 -> Overall Internal 40
    marks = {"Unit 1": 100, "Unit 2": 100, "Unit 3": 100, "Unit 4": 100, "Unit 5": 100, "Assessment Mark": 40}
    res = calculation_engine.calculate_theory_internal(marks)
    assert res["unitCount"] == 5
    assert res["average"] == 100.0
    assert res["utMark60"] == 60.0
    assert res["assessmentMark"] == 40.0
    assert res["total100"] == 100.0
    assert res["overallInternal40"] == 40.0


def test_theory_internal_exceeds_unit_max():
    marks = {"Unit 1": 101}
    with pytest.raises(ValueError, match="exceeds maximum allowed"):
        calculation_engine.calculate_theory_internal(marks)


def test_theory_internal_exceeds_assessment_max():
    marks = {"Unit 1": 75, "Assessment Mark": 45}
    with pytest.raises(ValueError, match="exceeds maximum allowed"):
        calculation_engine.calculate_theory_internal(marks)


def test_theory_internal_invalid_negative():
    marks = {"Unit 1": -5}
    with pytest.raises(ValueError, match="cannot be negative"):
        calculation_engine.calculate_theory_internal(marks)


# ─────────────────────────────────────────────────────────────────────────────
# 2. PRACTICAL INTERNAL CALCULATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_practical_internal_normal():
    # EX1..EX10 each 8 -> avg 8.0 -> 8.0 * 7.5 = 60. Model = 20 -> total = 80 -> overall internal 32
    marks = {f"EX{i}": 8 for i in range(1, 11)}
    marks["Model"] = 20
    res = calculation_engine.calculate_practical_internal(marks)
    assert res["exCount"] == 10
    assert res["exAverage"] == 8.0
    assert res["exConverted"] == 60.0
    assert res["modelPracticalMark"] == 20.0
    assert res["total100"] == 80.0
    assert res["overallInternal40"] == 32.0


def test_practical_internal_maximum():
    marks = {f"EX{i}": 10 for i in range(1, 11)}
    marks["Model"] = 25
    res = calculation_engine.calculate_practical_internal(marks)
    assert res["exConverted"] == 75.0
    assert res["modelPracticalMark"] == 25.0
    assert res["total100"] == 100.0
    assert res["overallInternal40"] == 40.0


def test_practical_internal_partial_missing():
    # Only EX1, EX2, EX3 entered, no model
    marks = {"EX1": 6, "EX2": 8, "EX3": 10}
    res = calculation_engine.calculate_practical_internal(marks)
    assert res["exCount"] == 3
    assert res["exAverage"] == 8.0
    assert res["exConverted"] == 60.0
    assert res["modelPracticalMark"] == 0.0
    assert res["total100"] == 60.0
    assert res["overallInternal40"] == 24.0


def test_practical_internal_invalid():
    marks = {"EX1": 8, "Model": 30}  # Model exceeds 25
    with pytest.raises(ValueError, match="exceeds maximum allowed"):
        calculation_engine.calculate_practical_internal(marks)

    with pytest.raises(ValueError, match="exceeds maximum allowed"):
        calculation_engine.calculate_practical_internal({"EX1": 12})


def test_practical_internal_prompt_examples():
    # Prompt Section 7 example:
    # EX1=8, EX2=9, EX3=7, EX4=blank, EX5=8, EX6=10, EX7=blank, EX8=9, EX9=8, EX10=7
    # Denominator must be 8, not 10.
    marks_sec7 = {
        "EX1": 8, "EX2": 9, "EX3": 7, "EX4": "", "EX5": 8,
        "EX6": 10, "EX7": None, "EX8": 9, "EX9": 8, "EX10": 7
    }
    res_sec7 = calculation_engine.calculate_practical_internal(marks_sec7)
    assert res_sec7["exCount"] == 8
    assert res_sec7["average"] == 8.25
    assert res_sec7["practicalMark75"] == pytest.approx(61.88, 0.01)

    # Prompt Section 18 example with 12 exercises:
    marks_sec18 = {
        "EX1": 8, "EX2": 9, "EX3": 7, "EX4": 8, "EX5": 10, "EX6": 9,
        "EX7": 8, "EX8": 7, "EX9": 9, "EX10": 8, "EX11": 10, "EX12": 9,
        "Model": 20
    }
    active_ex = [f"EX{i}" for i in range(1, 13)]
    res_sec18 = calculation_engine.calculate_practical_internal(marks_sec18, active_exercises=active_ex)
    assert res_sec18["exCount"] == 12
    assert res_sec18["average"] == 8.5
    assert res_sec18["practicalMark75"] == 63.75
    assert res_sec18["modelPracticalMark"] == 20.0
    assert res_sec18["total100"] == 83.75
    assert res_sec18["overallInternal40"] == 33.5

    # Explicit 0 test:
    marks_zero = {"EX1": 0, "EX2": 10}
    res_zero = calculation_engine.calculate_practical_internal(marks_zero, active_exercises=["EX1", "EX2"])
    assert res_zero["exCount"] == 2
    assert res_zero["average"] == 5.0
    assert res_zero["practicalMark75"] == 37.5


# ─────────────────────────────────────────────────────────────────────────────
# 3. INTEGRATED SUBJECT INTERNAL CALCULATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_integrated_internal_normal():
    # Theory raw: 80, Practical raw: 90 -> Combined = 170 / 200, Integrated / 50 = 170 / 4 = 42.5
    theory_marks = {"Unit 1": 100, "Unit 2": 100, "IA": 20}  # Unit avg 100 -> 60 + 20 = 80
    practical_marks = {f"EX{i}": 10 for i in range(1, 11)}  # avg 10 -> 75
    practical_marks["Model"] = 15                            # 75 + 15 = 90
    res = calculation_engine.calculate_integrated_internal(theory_marks, practical_marks)
    assert res["theoryInternal"] == 80.0
    assert res["practicalInternal"] == 90.0
    assert res["combinedTotal"] == 170.0
    assert res["integratedInternal"] == 42.5
    assert res["rawInternal"] == 42.5


def test_integrated_internal_prompt_example():
    # Exact prompt example:
    # Unit 1=80, Unit 2=90, Unit 3=blank, Unit 4=70, Unit 5=60 -> Avg=75, UT=45, IA=32 -> Theory Internal=77/100
    # Practical Avg=8, Practical Mark=60, Model=20 -> Practical Internal=80/100
    # Combined Total=157/200, Integrated Internal=39.25/50
    theory_marks = {
        "Unit 1": 80, "Unit 2": 90, "Unit 3": "", "Unit 4": 70, "Unit 5": 60,
        "Assessment Mark": 32
    }
    practical_marks = {
        "EX1": 8, "EX2": 8, "EX3": 8, "EX4": 8, "EX5": 8,
        "EX6": 8, "EX7": 8, "EX8": 8, "EX9": 8, "EX10": 8,
        "Model": 20
    }
    res = calculation_engine.calculate_integrated_internal(theory_marks, practical_marks)
    assert res["theoryInternal"] == 77.0
    assert res["practicalInternal"] == 80.0
    assert res["combinedTotal"] == 157.0
    assert res["integratedInternal"] == 39.25
    assert res["rawInternal"] == 39.25



# ─────────────────────────────────────────────────────────────────────────────
# 4. EXTERNAL MARK CONVERSION TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_external_conversion_theory():
    # Raw 100 -> Converted 60
    assert calculation_engine.convert_external(100, "THEORY") == 60.0
    # Raw 50 -> Converted 30
    assert calculation_engine.convert_external(50, "THEORY") == 30.0
    # Raw 75.5 -> Converted 75.5 / 100 * 60 = 45.3
    assert calculation_engine.convert_external(75.5, "THEORY") == pytest.approx(45.3)


def test_external_conversion_practical():
    # Raw 100 -> Converted 50
    assert calculation_engine.convert_external(100, "PRACTICAL") == 50.0


def test_external_conversion_invalid():
    with pytest.raises(ValueError, match="exceeds configured maximum"):
        calculation_engine.convert_external(105, "THEORY")
    with pytest.raises(ValueError, match="cannot be negative"):
        calculation_engine.convert_external(-10, "THEORY")


# ─────────────────────────────────────────────────────────────────────────────
# 5. FINAL RESULT CALCULATION & GRADE TESTS
# ─────────────────────────────────────────────────────────────────────────────

def test_final_result_theory_normal_pass():
    # Internal: 80 raw -> 80/100 * 40 = 32
    # External: 80 raw -> 80/100 * 60 = 48
    # Total = 32 + 48 = 80
    # Grade: A+ (80 - 89.999), Point: 9.0, Result: PASS
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=80.0, external_raw=80.0)
    assert res["internalConverted"] == 32.0
    assert res["externalConverted"] == 48.0
    assert res["finalMarks"] == 80
    assert res["grade"] == "A+"
    assert res["gradePoint"] == 9.0
    assert res["result"] == STATUS_PASS
    assert res["isPass"] is True


def test_final_result_theory_maximum():
    # Internal: 100 raw -> 40
    # External: 100 raw -> 60
    # Total = 100 -> Grade O, Point 10.0, PASS
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=100.0, external_raw=100.0)
    assert res["finalMarks"] == 100
    assert res["grade"] == "O"
    assert res["gradePoint"] == 10.0
    assert res["result"] == STATUS_PASS


def test_final_result_theory_zero():
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=0.0, external_raw=0.0)
    assert res["finalMarks"] == 0
    assert res["grade"] == "RA"
    assert res["gradePoint"] == 0.0
    assert res["result"] == STATUS_RA
    assert res["isPass"] is False


def test_final_result_external_minimum_failure():
    # Student has 100 internal (contributes 40.0)
    # External is 40 (which is < 45% minimum required)
    # Total unrounded = 40 + (40/100 * 60 = 24) = 64
    # Despite total being 64 (well above 50), student must FAIL due to external < 45%!
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=100.0, external_raw=40.0)
    assert res["finalMarks"] == 64
    assert res["grade"] == "RA"
    assert res["gradePoint"] == 0.0
    assert res["result"] == STATUS_RA
    assert res["isPass"] is False
    assert "Failed external minimum requirement" in res["reason"]


def test_final_result_overall_minimum_failure():
    # External is 46 (>= 45% passes external min), but internal is 0
    # External converted = 46/100 * 60 = 27.6
    # Total = 28 (< 50% overall pass threshold) -> RA
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=0.0, external_raw=46.0)
    assert res["finalMarks"] == 28
    assert res["grade"] == "RA"
    assert res["gradePoint"] == 0.0
    assert res["result"] == STATUS_RA
    assert res["isPass"] is False


def test_final_result_decimal_unrounded_intermediate():
    # Internal raw = 75.33 -> /100 * 40 = 30.132
    # External raw = 81.67 -> /100 * 60 = 49.002
    # Sum = 79.134 -> int(round) = 79 (Grade A)
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=75.33, external_raw=81.67)
    assert res["finalMarks"] == 79
    assert res["finalMarksDecimal"] == 79.13
    assert res["grade"] == "A"
    assert res["gradePoint"] == 8.0
    assert res["result"] == STATUS_PASS


# ─────────────────────────────────────────────────────────────────────────────
# 6. EXPLICIT INSTITUTIONAL STATUSES
# ─────────────────────────────────────────────────────────────────────────────

def test_status_absent():
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=80.0, external_raw=0.0, status_override="ABSENT")
    assert res["finalMarks"] == 0
    assert res["grade"] == "AB"
    assert res["gradePoint"] == 0.0
    assert res["result"] == STATUS_ABSENT
    assert res["isPass"] is False


def test_status_malpractice():
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=90.0, external_raw=80.0, status_override="MALPRACTICE")
    assert res["finalMarks"] == 0
    assert res["grade"] == "WH"
    assert res["gradePoint"] == 0.0
    assert res["result"] == STATUS_MALPRACTICE
    assert res["isPass"] is False


def test_status_withheld():
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=80.0, external_raw=80.0, status_override="WITHHELD")
    assert res["result"] == STATUS_WITHHELD
    assert res["isPass"] is False


def test_status_not_eligible():
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=30.0, external_raw=0.0, status_override="NOT ELIGIBLE")
    assert res["result"] == STATUS_NOT_ELIGIBLE
    assert res["isPass"] is False


def test_status_not_applicable():
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=0.0, external_raw=0.0, status_override="NOT APPLICABLE")
    assert res["result"] == STATUS_NOT_APPLICABLE
    assert res["isPass"] is False


# ─────────────────────────────────────────────────────────────────────────────
# 7. CUSTOM GRADE BOUNDARY OVERRIDES
# ─────────────────────────────────────────────────────────────────────────────

def test_custom_grade_boundaries():
    custom_cfg = AcademicRuleConfigModel(
        gradeBoundaries=[
            GradeBoundaryModel(grade="DISTINCTION", gradePoint=10.0, minMarks=85.0, maxMarks=100.0, resultStatus="PASS"),
            GradeBoundaryModel(grade="FIRST_CLASS", gradePoint=8.0, minMarks=65.0, maxMarks=84.999, resultStatus="PASS"),
            GradeBoundaryModel(grade="PASS_CLASS", gradePoint=6.0, minMarks=50.0, maxMarks=64.999, resultStatus="PASS"),
            GradeBoundaryModel(grade="FAIL", gradePoint=0.0, minMarks=0.0, maxMarks=49.999, resultStatus="FAIL"),
        ]
    )
    # Total score 70 -> FIRST_CLASS, 8.0
    res = calculation_engine.calculate_final_result("THEORY", internal_raw=70.0, external_raw=70.0, config=custom_cfg)
    assert res["finalMarks"] == 70
    assert res["grade"] == "FIRST_CLASS"
    assert res["gradePoint"] == 8.0
    assert res["result"] == STATUS_PASS
