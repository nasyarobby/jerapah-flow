import axios from "axios";
export default function ntfy(ctx) {
    log.info({ ctx }, "ntfy");
    const headers = {}
    
    if(ctx.data?.title) {
        headers.Title = ctx.data.title
    }

    axios.post(ctx.config?.url || "https://ntfy.sh/scrunner", ctx.data?.message || "Hello from scrunner", {
        headers: headers
    })
    return {sent: "true"}
}
