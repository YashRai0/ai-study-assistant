import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Search from "./pages/Search.jsx";
import MultiChat from "./pages/MultiChat.jsx";
import Chat from "./pages/Chat.jsx";
import Summary from "./pages/Summary.jsx";
import Flashcards from "./pages/Flashcards.jsx";
import Quiz from "./pages/Quiz.jsx";
import Analytics from "./pages/Analytics.jsx";
import StudyPlan from "./pages/StudyPlan.jsx";
import Groups from "./pages/Groups.jsx";
import GroupDetail from "./pages/GroupDetail.jsx";
import Review from "./pages/Review.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/chat-all" element={<ProtectedRoute><MultiChat /></ProtectedRoute>} />
        <Route path="/chat/:pdfId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/summary/:pdfId" element={<ProtectedRoute><Summary /></ProtectedRoute>} />
        <Route path="/flashcards/:pdfId" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
        <Route path="/quiz/:pdfId" element={<ProtectedRoute><Quiz /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/study-plan" element={<ProtectedRoute><StudyPlan /></ProtectedRoute>} />
        <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/groups/:groupId" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
        <Route path="/review" element={<ProtectedRoute><Review /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}
