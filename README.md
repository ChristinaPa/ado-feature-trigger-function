# ADO → GitHub Integration

Automatically create GitHub Issues when Azure DevOps work items change state. This project consists of two repositories that work together to bridge Azure DevOps and GitHub.

## Architecture

```
Azure DevOps          Azure Function                    GitHub
┌──────────┐    ┌─────────────────────────┐    ┌──────────────────────────┐
│ Work Item │───>│ ado-feature-trigger-     │───>│ ado-action-trigger       │
│ Updated   │    │ function (this repo)     │    │ (GitHub Actions workflow) │
│           │    │                         │    │                          │
│ Service   │    │ Receives webhook,       │    │ Listens for              │
│ Hook      │    │ sends repository_dispatch│    │ repository_dispatch,     │
└──────────┘    └─────────────────────────┘    │ creates GitHub Issue     │
                                                └──────────────────────────┘
```

## Repositories

| Repository | Purpose |
|---|---|
| [**ado-feature-trigger-function**](https://github.com/ChristinaPa/ado-feature-trigger-function) (this repo) | Azure Function that receives Azure DevOps webhooks and fires a GitHub `repository_dispatch` event |
| [**ado-action-trigger**](https://github.com/ChristinaPa/ado-action-trigger) | GitHub Actions workflow that listens for the dispatch event and creates a GitHub Issue |

## End-to-End Flow

1. A work item's state changes in **Azure DevOps** (e.g. moved to *Done*).
2. An ADO **Service Hook** (Web Hooks) sends a POST request to this **Azure Function**.
3. The function extracts the `workItemId` and `newState` from the payload.
4. If a state change is detected, the function calls the **GitHub API** to send a `repository_dispatch` event with type `ado_workitem_state_changed` to the [ado-action-trigger](https://github.com/ChristinaPa/ado-action-trigger) repo.
5. The GitHub Actions workflow in **ado-action-trigger** picks up the event and **creates a GitHub Issue** with the work item details.

### Dispatch Payload

The Azure Function sends the following payload to GitHub:

```json
{
  "event_type": "ado_workitem_state_changed",
  "client_payload": {
    "workItemId": "123",
    "newState": "Done"
  }
}
```

### Resulting GitHub Issue

The workflow creates an issue titled:

> ADO Work Item 123 moved to Done

---

## Azure Function Setup (this repo)

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- A GitHub personal access token with `repo` scope

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables in `local.settings.json`:

   ```json
   {
     "Values": {
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "AzureWebJobsStorage": "UseDevelopmentStorage=true",
       "GITHUB_OWNER": "<your-github-org-or-user>",
       "GITHUB_REPO": "<your-repo-name>",
       "GITHUB_TOKEN": "<your-personal-access-token>"
     }
   }
   ```

   | Variable | Description |
   |---|---|
   | `GITHUB_OWNER` | GitHub org or username that owns the **ado-action-trigger** repo |
   | `GITHUB_REPO` | Repository name (e.g. `ado-action-trigger`) |
   | `GITHUB_TOKEN` | Personal access token with `repo` scope |

3. Run locally:

   ```bash
   npm start
   ```

## Configuring the Azure DevOps Webhook

Azure DevOps [Service Hooks](https://learn.microsoft.com/en-us/azure/devops/service-hooks/services/webhooks?view=azure-devops) allow you to send a JSON payload to an external URL whenever a project event occurs. This integration uses a **Web Hooks** service hook to notify the Azure Function when a work item is updated.

When the hook fires, ADO sends a POST request containing the work item resource and any changed fields (including `System.State`). The Azure Function inspects the payload, and if a state change is present, forwards it to GitHub as a `repository_dispatch` event.

### Setup Steps

1. In your Azure DevOps project, go to **Project Settings → Service Hooks**.
2. Click **Create subscription** and select **Web Hooks** as the service.
3. Choose the **Work item updated** trigger. Optionally filter by:
   - Area path
   - Work item type (e.g. *Feature*, *User Story*)
   - Specific field changes (e.g. *State*)
4. Under **Action → Settings**, set the **URL** to your function endpoint:
   - Local: `http://localhost:7071/api/devops-workitem-webhook?code=<function-key>`
   - Deployed: `https://<your-function-app>.azurewebsites.net/api/devops-workitem-webhook?code=<function-key>`
5. Click **Test** to verify connectivity, then **Finish** to save.

For full details on configuring webhooks in Azure DevOps, see the [official documentation](https://learn.microsoft.com/en-us/azure/devops/service-hooks/services/webhooks?view=azure-devops).

## Why Azure Functions?

There are several ways to host the webhook handler that sits between Azure DevOps and GitHub. Here's a comparison of the main options:

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

### Deployment — GitHub as the Source

The function code is hosted in this GitHub repository and deployed to Azure using the **Deployment Center** feature in the Azure Portal. This approach was chosen over alternatives like ZIP deploy or local publishing because:

- **Version control** — All changes are tracked in Git with full commit history, branching, and pull request workflows.
- **Continuous deployment** — Azure automatically pulls and deploys the latest code whenever changes are pushed to the configured branch, removing the need for manual deployments.
- **Collaboration** — Team members can review and contribute to the function code through standard GitHub workflows.
- **Auditability** — Every deployment maps back to a specific commit, making it easy to trace issues or roll back.

#### Configuring Deployment in the Azure Portal

1. In the [Azure Portal](https://portal.azure.com), navigate to your **Function App**.
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

## GitHub Actions Workflow (ado-action-trigger repo)

The [ado-action-trigger](https://github.com/ChristinaPa/ado-action-trigger) repo contains a workflow at `.github/workflows/ado-feature.yml` that:

- Triggers on `repository_dispatch` events of type `ado_workitem_state_changed`
- Uses `actions/github-script` to create a GitHub Issue with the work item ID and new state

No additional setup is needed beyond ensuring the repository's **Settings → Actions → General → Workflow permissions** allow issue creation.

## Project Structure

```
host.json                          # Azure Functions host configuration
local.settings.json                # Local app settings / environment variables
package.json                       # Node.js project metadata
devops-workitem-webhook/
  function.json                    # Function bindings (HTTP trigger)
  index.js                         # Webhook handler
```
