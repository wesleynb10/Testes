#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: Teste geral end-to-end passando por todas as funcionalidades do FinPremium

## backend:
  - task: "Packages / Leads / Checkout API"
    implemented: true
    working: "partial"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "partial"
        agent: "main"
        comment: "packages+leads OK local. Checkout retorna 503 com sk_test_emergent inválida (bloqueio de ambiente, não regressão de código)."

  - task: "Auth JWT + Admin panel API"
    implemented: true
    working: true
    file: "backend/auth_service.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "login/me/logout/admin dashboard/leads/transactions/drip OK no E2E local (test_auth_admin + test_e2e_full)."

  - task: "Financial state + Transactions CRUD"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "GET/PUT financial-state, dashboard/summary, transactions create/update/delete/bulk OK."

  - task: "Credit analysis (mock provider)"
    implemented: true
    working: true
    file: "backend/credit_provider.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Unit 100% + /credit/price /quote /orders no E2E. Checkout Stripe de crédito não exercitado (mesma chave inválida)."

  - task: "Drip campaign"
    implemented: true
    working: "partial"
    file: "backend/drip_service.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "partial"
        agent: "main"
        comment: "Lead agenda 5 emails; admin/drip lista OK; fire-next marca failed/send_failed sem RESEND_API_KEY."

  - task: "Unit suite (provider/vision/audio/twilio/scr/routes/state)"
    implemented: true
    working: true
    file: "backend/tests/"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "104/104 passed (pytest -n 0)."

## frontend:
  - task: "Funil público (venda/calculadora/bonus)"
    implemented: true
    working: true
    file: "frontend/src/pages/SalesPage.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "UI E2E PASS — landing, packages, FAQ, calculadora, bonus CTA."

  - task: "Auth cliente + Onboarding"
    implemented: true
    working: true
    file: "frontend/src/pages/ClientAuth.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Signup com CPF, onboarding 3 passos, redirect ao dashboard OK."

  - task: "App pages (dashboard/lancamentos/orcamento/dividas/metas/credito/projecao/escopo)"
    implemented: true
    working: true
    file: "frontend/src/pages/"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "19/19 fluxos UI PASS incluindo Share Story e CSV modal open/close."

  - task: "Admin UI"
    implemented: true
    working: true
    file: "frontend/src/pages/AdminDashboard.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Login admin + 4 tabs (visão/leads/vendas/drip) + logout OK."

## metadata:
  created_by: "main_agent"
  version: "1.6-e2e-geral"
  test_sequence: 6
  run_ui: true

## test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: true
  test_priority: "sequential"

## agent_communication:
  - agent: "main"
    message: "E2E geral concluído em 2026-07-27. Relatório: test_reports/iteration_6_e2e_geral.json. Nova suite: backend/tests/test_e2e_full.py. Falhas restantes só env (Stripe/Resend)."
