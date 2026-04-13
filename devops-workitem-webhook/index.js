module.exports = async function (context, req) {

    context.log("ADO Webhook received.");

    const payload = req.body;
    const resource = payload?.resource;

    
   // Work item id
   const workItemId =
   resource?.workItemId ||
   resource?.id ||
   resource?.resourceContainers?.workItem?.id;

   // State: usually comes via resource.fields when it changes
   const newState =
   resource?.fields?.["System.State"]?.newValue ??
   resource?.revision?.fields?.["System.State"];

  // Type: often NOT included unless it changes -> use revision fallback
  const workItemType =
  resource?.fields?.["System.WorkItemType"]?.newValue ??
  resource?.revision?.fields?.["System.WorkItemType"];

// Debug logs
context.log("WorkItemId:", workItemId);
context.log("WorkItemType:", workItemType);
context.log("NewState:", newState);


    context.log("WorkItemType:", workItemType);
    context.log("NewState:", newState);

    // Only react to Features
    if (workItemType !== "Feature") {
        context.res = { status: 200 };
        return;
    }

    // Only when Feature moved to Done
    if (newState !== "Done") {
        context.res = { status: 200 };
        return;
    }

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    context.log(`About to call GitHub dispatch: owner=${owner}, repo=${repo}, event=ado_feature_state_changed`);


    const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            event_type: "ado_feature_state_changed",
            client_payload: {
                workItemId,
                newState
            }
        })
    }
);


context.log("GitHub dispatch response status:", response.status);

if (!response.ok) {
  const body = await response.text();
  context.log("GitHub dispatch response body:", body);
  // Optionally fail the function so it’s visible in invocations
  context.res = { status: 500, body: `GitHub dispatch failed: ${response.status} ${body}` };
  return;
}

context.log("GitHub dispatch succeeded.");
``

};