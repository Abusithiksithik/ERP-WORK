import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import LoginPage from './pages/auth/LoginPage';
import Dashboard from './pages/dashboard/Dashboard';
import StudentList from './pages/students/StudentList';
import StudentAdd from './pages/students/StudentAdd';
import StudentEdit from './pages/students/StudentEdit';
import StudentView from './pages/students/StudentView';
import DiscontinuedStudents from './pages/students/DiscontinuedStudents';
import VideoList from './pages/lms/VideoList';
import VideoAdd from './pages/lms/VideoAdd';
import VideoEdit from './pages/lms/VideoEdit';
import MaterialList from './pages/materials/MaterialList';
import MaterialAdd from './pages/materials/MaterialAdd';
import PaymentMethodList from './pages/payments/PaymentMethodList';
import EnrollmentList from './pages/enrollment/EnrollmentList';
import AttendancePage from './pages/attendance/AttendancePage';
import ProfilePage from './pages/profile/ProfilePage';
import UserList from './pages/profile/UserList';
import CourseList from './pages/courses/CourseList';
import CourseAdd from './pages/courses/CourseAdd';
import CourseEdit from './pages/courses/CourseEdit';
import BatchList from './pages/batches/BatchList';
import HostelList from './pages/hostel/HostelList';
import ExamFeeList from './pages/examFees/ExamFeeList';
import NewAdmissionList from './pages/newAdmission/NewAdmissionList';
import NewAdmissionAdd from './pages/newAdmission/NewAdmissionAdd';

const ADMIN_ROLES   = ['super_admin', 'admin'];
const ADMIN_INCHARGE = ['super_admin', 'admin', 'incharge'];
const ADMIN_TEACHER  = ['super_admin', 'admin', 'teacher'];
const ALL_ROLES     = ['super_admin', 'admin', 'incharge', 'teacher'];

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<PrivateRoute />}>
        <Route element={<Layout />}>
          {/* Root redirect to Students */}
          <Route path="/" element={<Navigate to="/students" replace />} />

          {/* Dashboard — all roles */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Students — Admin (full CRUD), Incharge (view), Teacher (view) */}
          <Route element={<PrivateRoute allowedRoles={ALL_ROLES} />}>
            <Route path="/students" element={<StudentList />} />
            <Route path="/students/:id" element={<StudentView />} />
          </Route>
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/students/add" element={<StudentAdd />} />
            <Route path="/students/:id/edit" element={<StudentEdit />} />
          </Route>

          {/* Discontinued — Admin only */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/discontinued-students" element={<DiscontinuedStudents />} />
          </Route>

          {/* Enrollment — Admin (full), Incharge (view + approve) */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_INCHARGE} />}>
            <Route path="/enrollments" element={<EnrollmentList />} />
          </Route>

          {/* Attendance — Admin, Incharge, Teacher */}
          <Route element={<PrivateRoute allowedRoles={ALL_ROLES} />}>
            <Route path="/attendance" element={<AttendancePage />} />
          </Route>

          {/* Videos — Admin (full CRUD), Teacher (upload + manage) */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_TEACHER} />}>
            <Route path="/videos" element={<VideoList />} />
            <Route path="/videos/add" element={<VideoAdd />} />
            <Route path="/videos/:id/edit" element={<VideoEdit />} />
          </Route>

          {/* Materials — Admin only (accessed via Student View for others) */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/materials" element={<MaterialList />} />
            <Route path="/materials/add" element={<MaterialAdd />} />
          </Route>

          {/* Payment Methods — Admin only (Settings section) */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/payment-methods" element={<PaymentMethodList />} />
          </Route>

          {/* Courses — Admin only (Settings section) */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/courses" element={<CourseList />} />
            <Route path="/courses/add" element={<CourseAdd />} />
            <Route path="/courses/:id/edit" element={<CourseEdit />} />
          </Route>

          {/* Batches — Admin only (Settings section) */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/batches" element={<BatchList />} />
          </Route>

          {/* Hostel — Admin only */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/hostel" element={<HostelList />} />
          </Route>

          {/* Exam Fees — Admin, Incharge */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_INCHARGE} />}>
            <Route path="/exam-fees" element={<ExamFeeList />} />
          </Route>

          {/* New Admissions — Admin, Incharge */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_INCHARGE} />}>
            <Route path="/new-admissions" element={<NewAdmissionList />} />
            <Route path="/new-admissions/add" element={<NewAdmissionAdd />} />
          </Route>

          {/* Users — Admin only */}
          <Route element={<PrivateRoute allowedRoles={ADMIN_ROLES} />}>
            <Route path="/users" element={<UserList />} />
          </Route>

          {/* Profile — all roles */}
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/students" replace />} />
    </Routes>
  );
}

export default App;
