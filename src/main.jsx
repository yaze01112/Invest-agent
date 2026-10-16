/* React 版進入點：把 <App /> 畫到 react.html 的 #root */
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
