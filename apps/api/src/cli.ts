import { CommandFactory } from "nest-commander";
import { CliModule } from "./cli/cli.module";

CommandFactory.run(CliModule, ["warn", "error"]);
