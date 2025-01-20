"""
    HistoricalStdlibVersions

Loads historical stdlib version information into Pkg to allow Pkg to resolve stdlib versions for prior julia versions.
"""
module HistoricalStdlibVersions
using Pkg
include("StdlibInfo.jl")
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

function register!()
    if isdefined(Pkg.Types, :STDLIBS_BY_VERSION)
        unregister!()
        if isdefined(Pkg.Types, :StdlibInfo)
            # We can directly use the datatypes in this package
            append!(Pkg.Types.STDLIBS_BY_VERSION, STDLIBS_BY_VERSION)
            merge!(Pkg.Types.UNREGISTERED_STDLIBS, UNREGISTERED_STDLIBS)
        else
            # We have to convert our `StdlibInfo` types into the more limited (name, version) format
            # from earlier julias.  Those julias are unable to resolve dependencies of stdlibs properly.
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
            for (uuid, info) in UNREGISTERED_STDLIBS
                Pkg.Types.UNREGISTERED_STDLIBS[uuid] = (info.name, nothing)
            end
        end
    end
end

function unregister!()
    empty!(Pkg.Types.STDLIBS_BY_VERSION)
    empty!(Pkg.Types.UNREGISTERED_STDLIBS)
end

function __init__()
    if get(ENV, "HISTORICAL_STDLIB_VERSIONS_AUTO_REGISTER", "true") == "true"
        register!()
    end
end
end # module HistoricalStdlibVersions
