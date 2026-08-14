// this script will get current time

function getCurrentTime() {
    return {
        data: {
            datetime: new Date().toISOString(),
            processId: "1234"
        }
    }
}

getCurrentTime.meta = {
  description: "Return the current time as ctx.data.datetime",
  config: {},
  input: {},
  output: {
    datetime: { type: "string", description: "ISO timestamp" },
    processId: { type: "string" },
  },
  example: {
    data: {},
    config: {},
  },
};

export default getCurrentTime;
