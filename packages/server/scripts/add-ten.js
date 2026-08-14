export default function main(context) {
    log.info({ input: context.input }, "add-ten");
    return context.input + 10;
}
