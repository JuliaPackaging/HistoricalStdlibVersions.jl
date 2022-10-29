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

function __init__()
    if !any(p -> first(p) == Base.VERSION, STDLIBS_BY_VERSION)
        @warn """
        This julia VERSION $(Base.VERSION) does not have an entry in the historical stdlib dictionary.
        Run the CI action "Update Historical Stdlibs" to update and make a new release.
        """
    end
end

end # module HistoricalStdlibVersions
