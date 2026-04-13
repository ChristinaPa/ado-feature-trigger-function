module.exports = async function (context, req) {

    context.log("ADO Webhook received.");

    const payload = req.body;
    const resource = payload?.resource;

    const workItemId = resource?.workItemId || resource?.id;
    const newState = resource?.revision?.fields?.["System.State"];
    const workItemType = resource?.revision?.fields?.["System.WorkItemType"];

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

    await fetch(
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

    context.res = {
        status: 200,
        body: "GitHub workflow triggered"
    };
};