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
    paperType: Optional[str] = "THEORY"
    regulation: Optional[str] = None

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

class FacultySubjectAccessModel(BaseModel):
    id: Optional[str] = None
    facultyId: str
    facultyName: Optional[str] = ""
    department: str
    semester: Optional[int] = None
    subjectCodes: List[str] = []

class AssessmentComponent(BaseModel):
    name: str  # e.g., "UT1", "UT2", "Unit 1", "Assignment", "Model"
    maxMarks: float = 20.0
    weightage: Optional[float] = 1.0

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



