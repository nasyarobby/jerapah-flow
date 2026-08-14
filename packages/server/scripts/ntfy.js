export default async function ntfy(ctx) {
    log.info({ ctx }, "ntfy incoming context");
    const headers = {}
    
    if(ctx.data?.title) {
        log.info("ntfy: setting title %s", ctx.data.title);
        headers.Title = ctx.data.title
    }

    const ntfyUrl = ctx.config?.url || "https://ntfy.sh/scrunner";

    log.info("ntfy sending message to %s", ntfyUrl);
    const truncatedMessage = ctx.data?.message?.substring(0, 100);
    log.info("ntfy messsage: %s", truncatedMessage);

    await $axios.post(ntfyUrl, ctx.data?.message || "Hello from scrunner", {
        headers: headers
    })
    return {sent: "true"}
}
