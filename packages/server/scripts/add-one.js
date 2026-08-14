export default function main(context) {
    log.info({ data: context.data }, "add-one");
    return { data: (context.data || 0) + 1 };
}
