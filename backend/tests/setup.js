import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bson = require("bson");

// MongoDB driver expects BSON.onDemand to expose NumberUtils/ByteUtils, but bson@7
// only includes parseToElements. Patch the exported BSON object before the driver loads.
bson.BSON = {
    ...bson.BSON,
    onDemand: {
        ...bson.BSON.onDemand,
        NumberUtils: bson.NumberUtils,
        ByteUtils: bson.ByteUtils
    }
};
