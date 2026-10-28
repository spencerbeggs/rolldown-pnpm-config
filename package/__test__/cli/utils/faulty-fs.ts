import { NodeFileSystem } from "@effect/platform-node";
import { Effect, FileSystem, Layer, PlatformError } from "effect";

/**
 * The real Node `FileSystem` with `exists` failing `PermissionDenied` (EACCES)
 * for one path; every other member, and `exists` on any other path, delegates
 * to the real implementation. Pins that an existence check which fails is a
 * failure, never "absent".
 */
export const fsWithDeniedExists = (deniedPath: string): Layer.Layer<FileSystem.FileSystem> =>
	Layer.effect(
		FileSystem.FileSystem,
		Effect.map(FileSystem.FileSystem, (real) =>
			FileSystem.FileSystem.of({
				...real,
				exists: (path) =>
					path === deniedPath
						? Effect.fail(
								PlatformError.systemError({
									_tag: "PermissionDenied",
									module: "FileSystem",
									method: "access",
									syscall: "access",
									pathOrDescriptor: path,
									description: "EACCES: permission denied",
								}),
							)
						: real.exists(path),
			}),
		),
	).pipe(Layer.provide(NodeFileSystem.layer));
