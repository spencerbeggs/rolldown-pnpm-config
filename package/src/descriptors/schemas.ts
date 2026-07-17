// package/src/descriptors/schemas.ts
import { Schema } from "effect";

/** @internal */ export const Bool = Schema.Boolean;
/** @internal */ export const Num = Schema.Number;
/** @internal */ export const Str = Schema.String;
/** @internal */ export const StringArray = Schema.Array(Schema.String);
/** @internal */ export const StringRecord = Schema.Record(Schema.String, Schema.String);
/** @internal */ export const BooleanRecord = Schema.Record(Schema.String, Schema.Boolean);
/** @internal */ export const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);
/** @internal */ export const StringArrayRecord = Schema.Record(Schema.String, StringArray);
