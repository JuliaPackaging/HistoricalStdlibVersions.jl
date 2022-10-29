# HistoricalStdlibVersions.jl

Loads historical stdlib version information into Pkg to allow Pkg to resolve stdlib versions for prior julia versions.

Usage
```julia
julia> import Pkg, HistoricalStdlibVersions

julia> append!(empty!(Pkg.STDLIBS_BY_VERSION), HistoricalStdlibVersions.STDLIBS_BY_VERSION)
```
