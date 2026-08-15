export interface User {
  id: number;
  full_name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'faculty' | 'student';
  is_active: boolean;
  mobile?: string;
  specialization?: string;
  created_at: string;
}

export interface Student {
  id: number;
  student_id: string;
  user_id?: number;
  full_name: string;
  mobile: string;
  email: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  parent_name?: string;
  parent_mobile?: string;
  photo_url?: string;
  course_id?: number;
  batch_id?: number;
  course_name?: string;
  batch_name?: string;
  admission_date: string;
  status: 'active' | 'inactive' | 'suspended' | 'discontinued';
  discontinued_at?: string;
  discontinued_reason?: string;
  // Certificate collection flags
  cert_10th_collected?: boolean;
  cert_12th_collected?: boolean;
  cert_diploma_collected?: boolean;
  disc_cert_10th?: boolean;
  disc_cert_12th?: boolean;
  disc_cert_diploma?: boolean;
  created_at: string;
}

export interface CourseCategory {
  id: number;
  category_name: string;
  description?: string;
  status: 'active' | 'inactive';
  course_count?: number;
  created_at: string;
}

export interface Course {
  id: number;
  category_id?: number;
  category_name?: string;
  course_name: string;
  description?: string;
  duration?: string;
  fee_amount: number;
  is_free: boolean;
  status: 'active' | 'inactive';
  student_count?: number;
  created_at: string;
}

export interface Batch {
  id: number;
  batch_name: string;
  course_id: number;
  course_name?: string;
  start_date?: string;
  end_date?: string;
  status: 'active' | 'inactive';
  student_count?: number;
}

export interface LmsModule {
  id: number;
  course_id: number;
  course_name?: string;
  module_name: string;
  order_number: number;
  status: 'active' | 'inactive';
}

export interface LmsVideo {
  id: number;
  course_id: number;
  module_id?: number;
  course_name?: string;
  module_name?: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  video_url: string;
  is_free: boolean;
  is_published: boolean;
  order_number: number;
  duration_seconds?: number;
  created_at: string;
}

export interface LmsMaterial {
  id: number;
  course_id: number;
  module_id?: number;
  course_name?: string;
  module_name?: string;
  title: string;
  description?: string;
  file_url: string;
  file_type: 'pdf' | 'ppt' | 'docx' | 'zip' | 'other';
  is_free: boolean;
  created_at: string;
}

export interface PaymentMethod {
  id: number;
  method_type: 'bank' | 'upi' | 'cash';
  account_holder_name?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  upi_id?: string;
  qr_image_url?: string;
  is_enabled: boolean;
}

export interface Payment {
  id: number;
  student_id: number;
  student_name?: string;
  student_code?: string;
  enrollment_id?: number;
  payment_method_id?: number;
  method_type?: string;
  amount: number;
  payment_date: string;
  transaction_reference?: string;
  status: 'pending' | 'verified' | 'rejected';
  notes?: string;
  verified_by?: number;
  verified_at?: string;
  created_at: string;
}

export interface Enrollment {
  id: number;
  student_id: number;
  student_name?: string;
  student_code?: string;
  course_id: number;
  course_name?: string;
  batch_id?: number;
  batch_name?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  enrolled_at: string;
  approved_by?: number;
  approved_at?: string;
  notes?: string;
  total_videos?: number;
  completed_videos?: number;
}

export interface Attendance {
  id: number;
  student_id: number;
  student_name?: string;
  student_code?: string;
  batch_id?: number;
  batch_name?: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
}

export interface DashboardStats {
  totalStudents: number;
  totalCourses: number;
  totalFaculty: number;
  totalRevenue: number;
  activeStudents: number;
  pendingPayments: number;
}
