"""
    HistoricalStdlibVersions

Loads historical stdlib version information into Pkg to allow Pkg to resolve stdlib versions for prior julia versions.
"""
module HistoricalStdlibVersions
using Pkg
import Base: UUID

# Use the `Pkg` `StdlibInfo` type if it exists, otherwise just re-define it
if !isdefined(Pkg.Types, :StdlibInfo)
struct StdlibInfo
    name::String
    uuid::UUID

    # This can be `nothing` if it's an unregistered stdlib
    version::Union{Nothing,VersionNumber}

    deps::Vector{UUID}
    weakdeps::Vector{UUID}
end
else
import Pkg.Types: StdlibInfo
end

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

function __init__()
    if isdefined(Pkg.Types, :STDLIBS_BY_VERSION)
        if isdefined(Pkg.Types, :StdlibInfo)
            # We can directly use the datatypes in this package
            append!(empty!(Pkg.Types.STDLIBS_BY_VERSION), STDLIBS_BY_VERSION)
            merge!(empty!(Pkg.Types.UNREGISTERED_STDLIBS), UNREGISTERED_STDLIBS)
        else
            # We have to convert our `StdlibInfo` types into the more limited (name, version) format
            # from earlier julias.  Those julias are unable to resolve dependencies of stdlibs properly.
            empty!(Pkg.Types.STDLIBS_BY_VERSION)
            for (version, stdlibs) in STDLIBS_BY_VERSION
                push!(Pkg.Types.STDLIBS_BY_VERSION, version => Dict{UUID,Tuple{String,Union{VersionNumber,Nothing}}}(
                    uuid => (info.name, info.version) for (uuid, info) in stdlibs
                ))
            end
            function find_first_info(uuid)
                for (_, stdlibs) in STDLIBS_BY_VERSION
                    for (stdlib_uuid, info) in stdlibs
                        if stdlib_uuid == uuid
                            return info
                        end
                    end
                end
                return nothing
            end
            empty!(Pkg.Types.UNREGISTERED_STDLIBS)
            for uuid in UNREGISTERED_STDLIBS
                info = find_first_info(uuid)
                if info === nothing
                    @error("Dangling unregistered stdlib?!", uuid)
                else
                    Pkg.Types.UNREGISTERED_STDLIBS[uuid] = (info.name, nothing)
                end
            end
        end
    end
end
end # module HistoricalStdlibVersions
