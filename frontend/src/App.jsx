import { useEffect, useState } from "react";
import LoginView from "./components/LoginView.jsx";
import DashboardView from "./components/DashboardView.jsx";
import HistoryView from "./components/HistoryView.jsx";
import RosterView from "./components/RosterView.jsx";
import StudentDetailView from "./components/StudentDetailView.jsx";
import SetupForm from "./components/SetupForm.jsx";
import UploadStudents from "./components/UploadStudents.jsx";
import ResultsView from "./components/ResultsView.jsx";
import { checkAuth, logout, getAssignment } from "./api.js";

export default function App() {
  const [authStatus, setAuthStatus] = useState("checking"); // checking | out | in
  // tab: "dashboard" | "new" | "history" | "assignment" | "roster" | "studentDetail"
  const [tab, setTab] = useState("dashboard");
  const [assignment, setAssignment] = useState(null);
  const [rosterId, setRosterId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    checkAuth().then((r) => setAuthStatus(r.loggedIn ? "in" : "out"));
  }, []);

  async function handleLogout() {
    await logout();
    setAuthStatus("out");
    setTab("dashboard");
    setAssignment(null);
  }

  function goTab(name) {
    setTab(name);
    setAssignment(null);
    setLoadError(null);
  }

  function handleCreated(newAssignment) {
    setAssignment(newAssignment);
    setTab("assignment");
  }

  async function handleSelect(id) {
    setLoadError(null);
    try {
      const full = await getAssignment(id);
      setAssignment(full);
      setTab("assignment");
    } catch (err) {
      setLoadError(err.message);
    }
  }

  function handleUploaded(added) {
    setAssignment((prev) => ({ ...prev, students: [...prev.students, ...added] }));
  }

  function handleAssignmentDeleted() {
    goTab("dashboard");
  }

  function handleViewRoster() {
    setTab("roster");
  }

  function handleSelectStudent(id) {
    setRosterId(id);
    setTab("studentDetail");
  }

  if (authStatus === "checking") {
    return null;
  }

  if (authStatus === "out") {
    return <LoginView onLoggedIn={() => setAuthStatus("in")} />;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <a
          href="#"
          className="wordmark"
          onClick={(e) => {
            e.preventDefault();
            goTab("dashboard");
          }}
        >
          <span>
            Handwriting Accuracy Checker
            <span className="wordmark-underline" />
          </span>
        </a>
        <nav className="tab-nav">
          <button
            type="button"
            className={`tab-link ${tab === "dashboard" ? "tab-link-active" : ""}`}
            onClick={() => goTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`tab-link ${tab === "new" ? "tab-link-active" : ""}`}
            onClick={() => goTab("new")}
          >
            New Assignment
          </button>
          <button
            type="button"
            className={`tab-link ${tab === "history" ? "tab-link-active" : ""}`}
            onClick={() => goTab("history")}
          >
            History
          </button>
          <button type="button" className="nav-back" onClick={handleLogout}>
            Log out
          </button>
        </nav>
      </div>

      <div className="app-main">
        {tab === "dashboard" && (
          <>
            <p className="subtitle">
              Score up to 10 students' handwritten answers for one topic against a correct
              answer, graded on meaning and key-point coverage rather than exact wording.
            </p>
            {loadError && <p className="error">{loadError}</p>}
            <DashboardView onSelect={handleSelect} onNew={() => goTab("new")} onViewRoster={handleViewRoster} />
          </>
        )}

        {tab === "new" && <SetupForm onCreated={handleCreated} />}

        {tab === "history" && (
          <>
            {loadError && <p className="error">{loadError}</p>}
            <HistoryView />
          </>
        )}

        {tab === "roster" && (
          <RosterView onSelect={handleSelectStudent} onBack={() => goTab("dashboard")} />
        )}

        {tab === "studentDetail" && rosterId && (
          <StudentDetailView
            rosterId={rosterId}
            onBack={() => setTab("roster")}
            onOpenAssignment={handleSelect}
          />
        )}

        {tab === "assignment" && assignment && (
          <>
            {assignment.students.length < 10 && (
              <UploadStudents assignment={assignment} onUploaded={handleUploaded} />
            )}
            {assignment.students.length > 0 && (
              <ResultsView assignment={assignment} onDeleted={handleAssignmentDeleted} />
            )}
          </>
        )}
      </div>
    </div>
  );
}