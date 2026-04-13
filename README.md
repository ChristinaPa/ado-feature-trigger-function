# Trigger GitHub Actions from Azure DevOps Work Item State Changes

Automatically trigger GitHub Actions whenever the **state of an Azure DevOps Work Item changes**, using:

- Azure DevOps Service Hooks
- Azure Functions (Linux, Consumption plan)
- GitHub `repository_dispatch` event

This project consists of two repositories that work together to bridge Azure DevOps and GitHub:

| Repository | Purpose |
|---|---|
| [**ado-feature-trigger-function**](https://github.com/ChristinaPa/ado-feature-trigger-function) (this repo) | Azure Function that receives Azure DevOps webhooks and fires a GitHub `repository_dispatch` event |
| [**ado-action-trigger**](https://github.com/ChristinaPa/ado-action-trigger) | GitHub Actions workflow that listens for the dispatch event and creates a GitHub Issue |

---

## Architecture Overview

```
Azure DevOps Work Item State Change
            ↓
Service Hook (Webhook)
            ↓
Azure Function (HTTP Trigger)
            ↓
GitHub REST API (repository_dispatch)
            ↓
GitHub Action Workflow Executes
```

---

## End-to-End Flow

When the **state of any work item changes** in Azure DevOps:

1. **Service Hook** sends a webhook to the Azure Function.
2. **Azure Function** receives the event and extracts the `workItemId` and `newState`.
3. If a state change is detected, the function triggers a GitHub **`repository_dispatch`** event with type `ado_workitem_state_changed`.
4. The target **GitHub Actions workflow** runs automatically and creates a GitHub Issue with the work item details.

---

# Implementation Steps

## 1. Create Azure Function App (Linux)

In the [Azure Portal](https://portal.azure.com):

- Create a new **Function App**
- Runtime: **Node.js**
- Operating System: **Linux**
- Plan: **Consumption**

---

## 2. Create Function Source Code

Initialize the function project locally using the Azure Functions Core Tools (`func init` and `func new` commands).

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- A GitHub personal access token with `repo` scope

Install dependencies with `npm install`.

---

## 3. Implement Webhook Handler

Update `devops-workitem-webhook/index.js` to trigger GitHub when the ADO Work Item **state changes**. See the implementation in [`devops-workitem-webhook/index.js`](devops-workitem-webhook/index.js).

The function:

- Receives the ADO webhook payload
- Extracts the `workItemId` and `newState` from the work item resource
- If no state change is detected, exits early with `200`
- Otherwise, calls the GitHub REST API to send a `repository_dispatch` event

### Dispatch Payload

The function sends a `repository_dispatch` event to GitHub with type `ado_workitem_state_changed` and a `client_payload` containing the `workItemId` and `newState`.

---

## 4. Push Function Code to GitHub

Push the project to a GitHub repository (e.g. `ado-feature-trigger-function`).

The function code is hosted in GitHub rather than deployed manually because:

- **Version control** — All changes are tracked with full commit history, branching, and pull request workflows.
- **Continuous deployment** — Azure automatically deploys on every push, removing the need for manual publishes.
- **Collaboration** — Team members can review and contribute through standard GitHub workflows.
- **Auditability** — Every deployment maps back to a specific commit, making rollbacks straightforward.

---

## 5. Configure Azure Deployment Center

In the [Azure Portal](https://portal.azure.com):

1. Navigate to your **Function App**.
2. Go to **Deployment Center** (under the *Deployment* section in the left menu).
3. Under **Source**, select **GitHub**.
4. Authorize Azure to access your GitHub account if prompted.
5. Configure the following:
   - **Organization**: `ChristinaPa`
   - **Repository**: `ado-feature-trigger-function`
   - **Branch**: `main`
6. Azure will automatically set up a GitHub Actions workflow (or use Kudu-based deployment) to build and deploy the function on every push to the selected branch.
7. Click **Save**.

Once configured, any push to `main` will automatically deploy the updated function code to Azure.

---

## 6. Configure Function App Settings

In the Azure Portal, go to **Function App → Configuration → Application settings** and add the following **Environment Variables**:

| Name | Value |
|---|---|
| `GITHUB_OWNER` | GitHub org or username that owns the target repo |
| `GITHUB_REPO` | Target repository name (e.g. `ado-action-trigger`) |
| `GITHUB_TOKEN` | GitHub personal access token with `repo` scope |

For local development, set these in [`local.settings.json`](local.settings.json). Then run locally with `npm start`.

---

## 7. Create Target GitHub Workflow

In the **target repository** ([ado-action-trigger](https://github.com/ChristinaPa/ado-action-trigger)), create a workflow at `.github/workflows/ado-feature.yml`. See the workflow file in the [ado-action-trigger repo](https://github.com/ChristinaPa/ado-action-trigger/blob/main/.github/workflows/ado-feature.yml).

The workflow:

- Triggers on `repository_dispatch` events with type `ado_workitem_state_changed`
- Uses `actions/github-script` to create a GitHub Issue with the work item ID and new state

Commit this to the **default branch (`main`)**.

Ensure the repository's **Settings → Actions → General → Workflow permissions** allow issue creation.

---

## 8. Configure Azure DevOps Service Hook

Azure DevOps [Service Hooks](https://learn.microsoft.com/en-us/azure/devops/service-hooks/services/webhooks?view=azure-devops) allow you to send a JSON payload to an external URL whenever a project event occurs. This integration uses a **Web Hooks** service hook to notify the Azure Function when a work item is updated.

In Azure DevOps:

1. Go to **Project Settings → Service Hooks**.
2. Click **Create subscription** and select **Web Hooks** as the service.
3. Choose the **Work item updated** trigger. Optionally filter by:
   - Area path
   - Work item type (e.g. *Feature*, *User Story*)
   - Specific field changes (e.g. *State*)
4. Under **Action → Settings**, set the **URL** to:

   ```
   https://<function-app>.azurewebsites.net/api/devops-workitem-webhook?code=<function-key>
   ```

5. Click **Test** to verify connectivity, then **Finish** to save.

For full details, see the [Azure DevOps Webhooks documentation](https://learn.microsoft.com/en-us/azure/devops/service-hooks/services/webhooks?view=azure-devops).

---

## Why Azure Functions?

There are several ways to host the webhook handler. Here's a comparison:

| Option | Pros | Cons |
|---|---|---|
| **Azure Functions (Consumption)** | Pay-per-execution, auto-scales to zero, no infrastructure to manage, native Azure integration | Cold-start latency on first invocation |
| **Azure App Service** | Always-on, full control over the runtime, supports WebSockets | Pays for idle time, overkill for a single lightweight endpoint |
| **Azure Container Apps** | Containerized workloads, scale-to-zero, good for microservices | More setup overhead (Dockerfile, container registry) for a simple webhook |
| **Azure Logic Apps** | Low-code/no-code, built-in ADO and GitHub connectors | Limited flexibility for custom logic, harder to version-control |
| **Self-hosted server (VM / on-prem)** | Full control, no vendor lock-in | Must manage uptime, networking, TLS, scaling, and patching yourself |
| **AWS Lambda / GCP Cloud Functions** | Similar serverless model | Cross-cloud adds complexity when both ADO and GitHub are already Azure/GitHub-aligned |

### Why we chose Azure Functions (Consumption plan)

- **Cost** — The function only runs when ADO fires a webhook, so with the Consumption plan we pay nothing when idle. Work item state changes are infrequent, making a pay-per-execution model ideal.
- **Simplicity** — A single JavaScript file with an HTTP trigger is all that's needed. No containers, no routing framework, no always-on server.
- **Azure-native** — Since Azure DevOps is part of the Azure ecosystem, deploying the function to Azure keeps networking simple and allows future use of Managed Identity or Azure Key Vault for secrets.
- **Scale** — The Consumption plan automatically handles traffic spikes without configuration.

---

## Project Structure

```
host.json                          # Azure Functions host configuration
local.settings.json                # Local app settings / environment variables
package.json                       # Node.js project metadata
devops-workitem-webhook/
  function.json                    # Function bindings (HTTP trigger)
  index.js                         # Webhook handler
```

---

This enables event-driven automation across Azure DevOps and GitHub for CI/CD, governance, deployments, or notifications.
