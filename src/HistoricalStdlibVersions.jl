"""
    HistoricalStdlibVersions

Loads historical stdlib version information into Pkg to allow Pkg to resolve stdlib versions for prior julia versions.

Usage
```julia-repl
julia> import Pkg, HistoricalStdlibVersions

julia> append!(empty!(Pkg.Types.STDLIBS_BY_VERSION), HistoricalStdlibVersions.STDLIBS_BY_VERSION)
```
"""
module HistoricalStdlibVersions

include("version_map.jl")

let
    max_hsg_version = maximum(first.(STDLIBS_BY_VERSION))
    # Throw a warning at compile-time if VERSION looks like it's a major or minor version ahead
    # of the latest version captured within `version_map.jl`.  This assumes that we bump at least
    # one stdlib every minor release, which so far appears to be a safe bet.
    if VersionNumber(max_hsg_version.major, max_hsg_version.minor) < VersionNumber(VERSION.major, VERSION.minor)
        @warn("HistoricalStdlibVersions seems to be out of date; please open an issue at https://github.com/JuliaPackaging/HistoricalStdlibVersions.jl/issues")
    end
end
end # module HistoricalStdlibVersions
