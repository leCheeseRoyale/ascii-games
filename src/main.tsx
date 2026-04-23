import "./styles.css";
import "@ui/defaults";
import { App } from "@ui/App";
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");
createRoot(rootEl).render(<App />);
