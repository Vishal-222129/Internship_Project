const notebook = document.getElementById('notebook');
const statusBadge = document.getElementById('status-badge');

let pyodideReady = false;
let pyodide;

// 1. Initialize Python Engine
async function initEngine() {
    try {
        pyodide = await loadPyodide();
        
        statusBadge.innerText = "System Ready";
        statusBadge.className = "ready";
        pyodideReady = true;

        createCell();
    } catch (err) {
        statusBadge.innerText = "Error Loading Engine";
        statusBadge.style.backgroundColor = "#ff7b72";
    }
}

// 2. Dynamic Cell Creation
function createCell() {
    const cellDiv = document.createElement('div');
    cellDiv.className = 'cell';

    cellDiv.innerHTML = `
        <div class="cell-controls">
            <button class="run-btn" title="Run Cell (Shift+Enter)">▶</button>
        </div>
        <div class="cell-content">
            <textarea class="code-input"></textarea>
            <pre class="cell-output"></pre>
        </div>
    `;

    notebook.appendChild(cellDiv);

    const textArea = cellDiv.querySelector('.code-input');
    const runBtn = cellDiv.querySelector('.run-btn');
    const outputArea = cellDiv.querySelector('.cell-output');

    const editor = CodeMirror.fromTextArea(textArea, {
        mode: "python",
        theme: "dracula",
        lineNumbers: true,
        indentUnit: 4,
        viewportMargin: Infinity,
        extraKeys: {
            "Shift-Enter": function() {
                runCell(editor, outputArea, runBtn, cellDiv);
            }
        }
    });

    runBtn.addEventListener('click', () => {
        runCell(editor, outputArea, runBtn, cellDiv);
    });

    editor.focus();
}

// 3. Execution Logic for a specific cell
async function runCell(editor, outputArea, runBtn, cellDiv) {
    if (!pyodideReady) return;

    const code = editor.getValue().trim();
    if (code === "") return; 

    runBtn.disabled = true;
    
    // We use a temporary span so we can easily remove it later without deleting plots
    outputArea.innerHTML = '<span class="exec-msg" style="color: #d29922;">Executing...</span>';
    outputArea.className = "cell-output show"; 

    try {
        // Download libraries
        await pyodide.loadPackagesFromImports(code);

        // Tell Matplotlib to draw its canvas specifically inside THIS cell's output area
        document.pyodideMplTarget = outputArea;

        // ✨ THE COMBINED FIX ✨
        // Reset text output, override input(), and fix Matplotlib toolbar
        await pyodide.runPythonAsync(`
            import sys
            import io
            import builtins
            import js
            
            # Redirect standard output
            sys.stdout = io.StringIO()
            
            # Create a custom input function using browser prompt
            def browser_input(prompt_text=""):
                answer = js.prompt(prompt_text)
                if answer is None:
                    answer = ""
                # Print the prompt and answer so it shows in the cell output
                print(f"{prompt_text}{answer}")
                return answer
                
            builtins.input = browser_input
            
            # Disable Matplotlib toolbar and close old graphs
            try:
                import matplotlib as mpl
                import matplotlib.pyplot as plt
                mpl.rcParams['toolbar'] = 'None'
                plt.close('all')
            except ImportError:
                pass
        `);

        // Run the code! If matplotlib draws a plot, it will automatically append a <canvas> here
        await pyodide.runPythonAsync(code);

        // Fetch standard text output
        const stdout = pyodide.runPython("sys.stdout.getvalue()");
        
        // Remove the "Executing..." loading text
        const execMsg = outputArea.querySelector('.exec-msg');
        if (execMsg) execMsg.remove();

        // Check if Matplotlib generated a plot element inside the output area
        const hasPlot = outputArea.children.length > 0; 

        // If there is text output, insert it BEFORE the graph
        if (stdout.trim() !== "") {
            const textSpan = document.createElement('div');
            textSpan.innerText = stdout;
            outputArea.insertBefore(textSpan, outputArea.firstChild);
        }

        // If nothing was printed and no plot was drawn
        if (stdout.trim() === "" && !hasPlot) {
            outputArea.innerHTML = '<span style="color: #8b949e;">[Executed Successfully. No output.]</span>';
        }

    } catch (err) {
        outputArea.innerHTML = "";
        outputArea.innerText = err;
        outputArea.className = "cell-output show error";
    } finally {
        runBtn.disabled = false;
        
        // Clear the Matplotlib target so future graphs don't accidentally render here
        document.pyodideMplTarget = null;

        if (cellDiv === notebook.lastElementChild) {
            createCell();
        }
    }
}

// Start the sequence
initEngine();