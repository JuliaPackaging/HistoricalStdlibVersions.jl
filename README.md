# HistoricalStdlibVersions.jl

Loads historical stdlib version information into Pkg to allow Pkg to resolve stdlib versions for prior Julia versions.

Usage:
```julia
julia> import HistoricalStdlibVersions

julia> HistoricalStdlibVersions.register!()
```
