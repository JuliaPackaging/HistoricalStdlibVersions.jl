# HistoricalStdlibVersions.jl

Loads historical stdlib version information into Pkg to allow Pkg to resolve stdlib versions for prior Julia versions.

An interactive chart of which stdlib versions shipped with each Julia release is at
<https://juliapackaging.github.io/HistoricalStdlibVersions.jl/>.

Usage:
```julia
julia> import HistoricalStdlibVersions

julia> HistoricalStdlibVersions.register!()
```
