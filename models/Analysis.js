import mongoose from "mongoose";

const analysisSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["logs", "api"],
      required: true,
    },
    input: {
      type: String,
      required: true,
    },
    result: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Analysis", analysisSchema);