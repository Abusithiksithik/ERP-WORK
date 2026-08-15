import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import LoginPage from './pages/auth/LoginPage';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Dashboard from './pages/dashboard/Dashboard';
import StudentList from './pages/students/StudentList';
import StudentAdd from './pages/students/StudentAdd';
import StudentEdit from './pages/students/StudentEdit';
import StudentView from './pages/students/StudentView';
import DiscontinuedStudents from './pages/students/DiscontinuedStudents';
import CategoryList from './pages/categories/CategoryList';
import CourseList from './pages/courses/CourseList';
import CourseAdd from './pages/courses/CourseAdd';
import CourseEdit from './pages/courses/CourseEdit';
import BatchList from './pages/batches/BatchList';
import ModuleList from './pages/lms/ModuleList';
import VideoList from './pages/lms/VideoList';
import VideoAdd from './pages/lms/VideoAdd';
import VideoEdit from './pages/lms/VideoEdit';
import MaterialList from './pages/materials/MaterialList';
import MaterialAdd from './pages/materials/MaterialAdd';
import PaymentMethodList from './pages/payments/PaymentMethodList';
import PaymentList from './pages/payments/PaymentList';
import EnrollmentList from './pages/enrollment/EnrollmentList';
import AttendancePage from './pages/attendance/AttendancePage';
import ProfilePage from './pages/profile/ProfilePage';
import UserList from './pages/profile/UserList';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<PrivateRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<StudentList />} />
          <Route path="/students/add" element={<StudentAdd />} />
          <Route path="/students/:id" element={<StudentView />} />
          <Route path="/students/:id/edit" element={<StudentEdit />} />
          <Route path="/discontinued-students" element={<DiscontinuedStudents />} />
          <Route path="/categories" element={<CategoryList />} />
          <Route path="/courses" element={<CourseList />} />
          <Route path="/courses/add" element={<CourseAdd />} />
          <Route path="/courses/:id/edit" element={<CourseEdit />} />
          <Route path="/batches" element={<BatchList />} />
          <Route path="/modules" element={<ModuleList />} />
          <Route path="/videos" element={<VideoList />} />
          <Route path="/videos/add" element={<VideoAdd />} />
          <Route path="/videos/:id/edit" element={<VideoEdit />} />
          <Route path="/materials" element={<MaterialList />} />
          <Route path="/materials/add" element={<MaterialAdd />} />
          <Route path="/payment-methods" element={<PaymentMethodList />} />
          <Route path="/payments" element={<PaymentList />} />
          <Route path="/enrollments" element={<EnrollmentList />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/users" element={<UserList />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
