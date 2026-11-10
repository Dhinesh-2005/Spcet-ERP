from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime

class StudentModel(BaseModel):
    registerNumber: str
    name: Optional[str] = None
    password: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[int] = None
    year: Optional[int] = None
    role: Optional[str] = "student"

class FacultyModel(BaseModel):
    registerNumber: str
    name: Optional[str] = None
    password: Optional[str] = None
    department: Optional[str] = None

class HodModel(BaseModel):
    registerNumber: str
    name: Optional[str] = None
    password: Optional[str] = None
    department: Optional[str] = None

class SubjectModel(BaseModel):
    id: Optional[str] = None
    subjectCode: str
    subjectName: Optional[str] = None
    department: str
    semester: Optional[int] = None
    l: Optional[int] = 0
    t: Optional[int] = 0
    p: Optional[int] = 0
    credits: Optional[float] = 0.0
    subjectType: Optional[str] = "THEORY"  # "THEORY", "PRACTICAL", "INTEGRATED"
    paperType: Optional[str] = None        # Alias for backward compatibility
    regulation: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    isActive: Optional[bool] = True

class StudentSubjectModel(BaseModel):
    id: Optional[str] = None
    registerNumber: str
    subjectCode: str
    subjectSemester: int
    category: str

class OtherSubjectUploadRow(BaseModel):
    subjectCode: str
    subjectName: Optional[str] = ""
    subjectSemester: int
    category: str
    rollNumbers: str


class InternalMarksModel(BaseModel):
    registerNumber: str
    subjectCode: str
    theoryUtScore: Optional[float] = 0.0
    theorySeminarScore: Optional[float] = 0.0
    practicalExpScore: Optional[float] = 0.0
    practicalModelScore: Optional[float] = 0.0
    finalInternal: Optional[float] = 0.0

class ExternalMarksModel(BaseModel):
    registerNumber: str
    subjectCode: str
    externalMarks: Optional[int] = 0

class ResultModel(BaseModel):
    registerNumber: str
    subjectCode: str
    semester: str
    department: str
    grade: Optional[str] = "RA"
    result: Optional[str] = "FAIL"
    finalMarks: Optional[int] = 0
    isPublished: Optional[bool] = False

class QuestionPaperModel(BaseModel):
    id: Optional[str] = None
    subjectCode: str
    qpCode: Optional[str] = None
    department: str
    examSession: Optional[str] = None
    hasPartC: Optional[bool] = False
    examType: Optional[str] = "SEMESTER"
    facultyName: Optional[str] = None
    paperData: Optional[str] = None
    semester: Optional[str] = None
    unit: Optional[str] = None

class RequisitionModel(BaseModel):
    id: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[str] = None
    subjectCode: Optional[str] = None
    courseTitle: Optional[str] = None
    examType: Optional[str] = None
    facultyId: Optional[str] = None
    deadline: Optional[str] = None
    appointmentLetterNo: Optional[str] = None
    status: Optional[str] = "PENDING"
    facultyName: Optional[str] = None
    designation: Optional[str] = None
    collegeNameCode: Optional[str] = None
    qpDept: Optional[str] = None
    examinerDept: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    qpType: Optional[str] = None
    semesterAndReg: Optional[str] = None
    amountClaimed: Optional[str] = None
    mailedConfirmation: Optional[bool] = False
    accountNo: Optional[str] = None
    ifsc: Optional[str] = None
    bankName: Optional[str] = None
    branchName: Optional[str] = None
    aicteId: Optional[str] = None
    pan: Optional[str] = None
    address: Optional[str] = None
    totalAmount: Optional[str] = None

class QuestionBankModel(BaseModel):
    id: Optional[str] = None
    subjectId: Optional[str] = None
    subjectCode: str
    subjectName: Optional[str] = None
    regulation: Optional[str] = None
    semester: Optional[Any] = None
    unit: str
    question: str
    part: str
    marks: float
    co: str
    kLevel: Optional[str] = "K1"
    image: Optional[Any] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

class GenerateQuestionPaperRequest(BaseModel):
    subjectCode: str
    unit: str
    partACount: Optional[int] = 5
    partBCount: Optional[int] = 4
    partCCount: Optional[int] = 2


# ─────────────────────────────────────────────────────────────────────────────
# NEW ACADEMIC & RESULT SCHEMAS (Additive & Backward Compatible)
# ─────────────────────────────────────────────────────────────────────────────

class DepartmentModel(BaseModel):
    id: Optional[str] = None
    code: str
    name: str
    codePrefix: Optional[str] = None
    status: Optional[str] = "ACTIVE"

class RegulationModel(BaseModel):
    id: Optional[str] = None
    code: str
    name: str
    effectiveYear: Optional[int] = None
    status: Optional[str] = "ACTIVE"

class AcademicYearModel(BaseModel):
    id: Optional[str] = None
    year: str  # e.g., "2026-2027"
    isCurrent: Optional[bool] = False

class SemesterModel(BaseModel):
    id: Optional[str] = None
    number: int
    name: Optional[str] = None

class StudentEnrollmentModel(BaseModel):
    id: Optional[str] = None
    registerNumber: str
    academicYear: str
    semester: int
    department: str
    section: Optional[str] = "A"
    regulation: Optional[str] = None

class FacultyAssignmentItem(BaseModel):
    subjectId: Optional[str] = None
    subjectCode: str
    subjectName: Optional[str] = ""
    studentDepartment: Optional[str] = "ALL"
    regulation: Optional[str] = "2021"
    semester: Optional[int] = 1
    academicYear: Optional[str] = "2025-2026"
    status: Optional[str] = "ACTIVE"

class FacultySubjectAccessModel(BaseModel):
    id: Optional[str] = None
    facultyId: str
    facultyName: Optional[str] = ""
    department: str
    semester: Optional[int] = None
    subjectCodes: List[str] = []
    assignments: Optional[List[FacultyAssignmentItem]] = []

class AssessmentComponent(BaseModel):
    name: str  # e.g., "UT1", "UT2", "Unit 1", "Assignment", "Model"
    maxMarks: float = 20.0
    weightage: Optional[float] = 1.0

class BatchModel(BaseModel):
    id: Optional[str] = None
    batchName: str  # e.g., "2022-2026"
    department: str
    startYear: int
    endYear: int
    currentSemester: Optional[int] = 1
    regulation: Optional[str] = "2021"
    status: Optional[str] = "ACTIVE"

class GradeBoundaryModel(BaseModel):
    grade: str            # "O", "A+", "A", "B+", "B", "C", "RA"
    gradePoint: float     # 10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 0.0
    minMarks: float       # Inclusive lower bound, e.g., 90.0
    maxMarks: float       # Inclusive upper bound, e.g., 100.0
    resultStatus: str = "PASS"  # "PASS" or "FAIL"

class AcademicRuleConfigModel(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = "Central Academic Configuration"
    regulation: Optional[str] = "ALL"
    department: Optional[str] = "ALL"
    semester: Optional[int] = None
    isDefault: Optional[bool] = True

    # Theory internal components
    utCount: int = 5
    utMax: float = 100.0
    utWeightageMax: float = 60.0
    iaMax: float = 40.0
    internalMax: float = 100.0

    # Practical internal components
    practicalExCount: int = 10
    practicalExMax: float = 10.0
    practicalExConvertedMax: float = 75.0
    modelPracticalMax: float = 25.0

    # Weightage & External Conversion (Theory: 40 internal / 60 external)
    theoryInternalWeightage: float = 40.0
    theoryExternalWeightage: float = 60.0

    # Weightage & External Conversion (Practical: 50 internal / 50 external)
    practicalInternalWeightage: float = 50.0
    practicalExternalWeightage: float = 50.0

    # Integrated subject configuration
    integratedTheoryRatio: float = 0.5
    integratedPracticalRatio: float = 0.5
    integratedInternalWeightage: float = 50.0
    integratedExternalWeightage: float = 50.0

    # External exam raw max
    externalRawMax: float = 100.0

    # Passing criteria
    overallPassPercentage: float = 50.0
    externalMinPercentage: float = 45.0
    internalMinPercentage: float = 0.0

    # Arrear & Attendance
    arrearValiditySemesters: int = 3
    expiredArrearPassPercentage: float = 50.0
    attendanceMinPercentage: float = 75.0

    # Grade boundaries (Anna University 10-point scale)
    gradeBoundaries: List[GradeBoundaryModel] = Field(default_factory=lambda: [
        GradeBoundaryModel(grade="O", gradePoint=10.0, minMarks=90.0, maxMarks=100.0, resultStatus="PASS"),
        GradeBoundaryModel(grade="A+", gradePoint=9.0, minMarks=80.0, maxMarks=89.999, resultStatus="PASS"),
        GradeBoundaryModel(grade="A", gradePoint=8.0, minMarks=70.0, maxMarks=79.999, resultStatus="PASS"),
        GradeBoundaryModel(grade="B+", gradePoint=7.0, minMarks=60.0, maxMarks=69.999, resultStatus="PASS"),
        GradeBoundaryModel(grade="B", gradePoint=6.0, minMarks=50.0, maxMarks=59.999, resultStatus="PASS"),
        GradeBoundaryModel(grade="C", gradePoint=5.0, minMarks=45.0, maxMarks=49.999, resultStatus="PASS"),
        GradeBoundaryModel(grade="RA", gradePoint=0.0, minMarks=0.0, maxMarks=44.999, resultStatus="FAIL"),
    ])

    # Rounding rules
    roundAtFinalStageOnly: bool = True
    decimalPrecision: int = 2
    roundToInteger: bool = True

class AssessmentConfigModel(BaseModel):
    id: Optional[str] = None
    department: str
    semester: int
    regulation: Optional[str] = None
    subjectCode: Optional[str] = None  # None for default semester-wide config
    components: List[AssessmentComponent] = []
    totalInternalMaxMark: float = 40.0

class StudentSubjectRecordModel(BaseModel):
    id: Optional[str] = None
    registerNumber: str
    subjectCode: str
    subjectName: str
    semester: int
    academicYear: Optional[str] = None
    credits: int
    subjectType: Optional[str] = "THEORY"
    internalMark: Optional[float] = 0.0
    externalMark: Optional[float] = 0.0
    totalMark: Optional[float] = 0.0
    grade: Optional[str] = "RA"
    gradePoint: Optional[float] = 0.0
    result: Optional[str] = "FAIL"
    attemptNumber: Optional[int] = 1
    category: Optional[str] = "REGULAR"

class PreviousResultRow(BaseModel):
    registerNumber: str
    subjectCode: str
    subjectName: str
    semester: int
    academicYear: Optional[str] = "2025-2026"
    credits: int
    grade: str
    gradePoint: Optional[float] = None
    result: Optional[str] = None

class SaveFacultyMarksPayload(BaseModel):
    subjectCode: str
    semester: int
    department: Optional[str] = None
    marks: List[Dict[str, Any]]  # List of { registerNumber, componentMarks: { "UT1": 18, "Unit1": 15 }, finalInternal: 38 }
    status: Optional[str] = "DRAFT"  # "DRAFT" or "SUBMITTED"

class MarkHistoryModel(BaseModel):
    id: Optional[str] = None
    registerNumber: str
    subjectCode: str
    component: str
    oldMark: Optional[Any] = None
    newMark: Optional[Any] = None
    facultyId: str
    facultyName: Optional[str] = ""
    timestamp: str

class ExcelUploadValidationError(BaseModel):
    row: int
    rollNumber: str
    subject: str
    field: str
    error: str
    expectedValue: str

class ExcelValidationPreviewResponse(BaseModel):
    totalRows: int
    validRows: int
    errorRows: int
    errors: List[ExcelUploadValidationError] = []
    preview: List[Dict[str, Any]] = []
    isValid: bool

class ConfirmMarksUploadPayload(BaseModel):
    facultyId: str
    facultyName: Optional[str] = "Faculty"
    subjectCode: str
    semester: int
    status: Optional[str] = "DRAFT"  # "DRAFT" or "SUBMITTED"
    marks: List[Dict[str, Any]]

class ArrearModel(BaseModel):
    id: Optional[str] = None
    registerNumber: str
    subjectCode: str
    subjectName: str
    originalSemester: int
    originalAcademicYear: Optional[str] = "2025-2026"
    credits: float = 3.0
    subjectType: Optional[str] = "THEORY"
    originalResult: Optional[str] = "RA"
    attemptNumber: int = 1
    currentAttempt: int = 1
    internalMarks: float = 0.0
    originalInternalMarks: float = 0.0
    externalMarks: Optional[float] = 0.0
    finalMarks: Optional[float] = 0.0
    grade: Optional[str] = "RA"
    gradePoint: Optional[float] = 0.0
    status: str = "PENDING"  # "PENDING", "CLEARED"
    internalStatus: str = "VALID"  # "VALID", "INTERNAL_NOT_APPLICABLE"
    semestersElapsed: int = 0
    clearedDate: Optional[str] = None
    currentSemester: int = 1
    updatedAt: Optional[str] = None

class AuditLogModel(BaseModel):
    id: Optional[str] = None
    user: str
    role: Optional[str] = "admin"
    action: str
    entity: str
    oldValue: Optional[Any] = None
    newValue: Optional[Any] = None
    details: Optional[Any] = None
    timestamp: str

class ResultBatchStatusModel(BaseModel):
    id: Optional[str] = None
    department: str
    semester: int
    academicYear: Optional[str] = "2025-2026"
    state: str = "DRAFT"  # "DRAFT", "VALIDATED", "READY_FOR_PUBLISH", "PUBLISHED"
    isLocked: bool = False
    validationSummary: Optional[Dict[str, Any]] = None
    lastValidatedAt: Optional[str] = None
    lastPublishedAt: Optional[str] = None
    lastRecalculatedAt: Optional[str] = None
    lockedAt: Optional[str] = None
    lockedBy: Optional[str] = None
    updatedAt: Optional[str] = None

class ResultPublishPayload(BaseModel):
    department: str
    semester: int
    academicYear: Optional[str] = "2025-2026"
    actionUser: Optional[str] = "admin"

class ResultLockPayload(BaseModel):
    department: str
    semester: int
    academicYear: Optional[str] = "2025-2026"
    isLocked: Optional[bool] = True
    actionUser: Optional[str] = "admin"
    reason: Optional[str] = None





