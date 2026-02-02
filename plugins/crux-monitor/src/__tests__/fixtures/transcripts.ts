/**
 * Sample transcripts for testing
 */

export const SAMPLE_TRANSCRIPTS = {
  /** Japanese language conversation */
  japanese: `{"type":"user","message":{"role":"user","content":"今このディレクトリにPDFがあるのがわかると思う。bunでプロジェクトを立ち上げる"}}
{"type":"assistant","message":{"role":"assistant","content":"PDFファイルを確認して、bunプロジェクトを立ち上げます。"}}
{"type":"tool_use","tool":"Bash","input":{"command":"ls -la *.pdf"}}
{"type":"tool_result","output":"sample.pdf"}
{"type":"assistant","message":{"role":"assistant","content":"PDFファイルを確認しました。bunプロジェクトを初期化します。"}}`,

  /** English language conversation */
  english: `{"type":"user","message":{"role":"user","content":"I want to create a new React component for the dashboard"}}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you create a new React component for the dashboard."}}
{"type":"tool_use","tool":"Write","input":{"path":"src/components/Dashboard.tsx"}}
{"type":"tool_result","output":"File created"}
{"type":"assistant","message":{"role":"assistant","content":"I've created the Dashboard component. Let me add the styling next."}}`,

  /** AskUserQuestion tool use for notification event */
  askUserQuestion: `{"type":"user","message":{"role":"user","content":"Help me set up the database"}}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you set up the database. First, I need to know which database you'd like to use."}}
{"type":"tool_use","tool":"AskUserQuestion","input":{"question":"Which database would you like to use?","options":["PostgreSQL","MySQL","SQLite"]}}`,

  /** Empty/minimal transcript */
  minimal: `{"type":"user","message":{"role":"user","content":"Hello"}}`,

  /** Long transcript (for testing tail reading) */
  long: Array.from(
    { length: 100 },
    (_, i) => `{"type":"assistant","message":{"role":"assistant","content":"Line ${i + 1}"}}`,
  ).join("\n"),
};
