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
    semester: int
    l: Optional[int] = 0
    t: Optional[int] = 0
    p: Optional[int] = 0
    credits: Optional[int] = 0
    paperType: Optional[str] = "THEORY"

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
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

class GenerateQuestionPaperRequest(BaseModel):
    subjectCode: str
    unit: str
    partACount: Optional[int] = 5
    partBCount: Optional[int] = 4
    partCCount: Optional[int] = 2


