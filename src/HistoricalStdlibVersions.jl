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

end # module HistoricalStdlibVersions
