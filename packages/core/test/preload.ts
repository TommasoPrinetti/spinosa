import path from "path"

process.env.SPINOSA_DB = ":memory:"
process.env.SPINOSA_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.SPINOSA_DISABLE_MODELS_FETCH = "true"
