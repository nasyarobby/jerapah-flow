// this script will get current time

export default function getCurrentTime() {
    return {
        data: {
            datetime: new Date().toISOString(),
            processId: "1234"
        }
    }
}